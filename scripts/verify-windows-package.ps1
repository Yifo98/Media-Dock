param(
    [Parameter(Mandatory = $true)]
    [string]$PackagePath,
    [Parameter(Mandatory = $true)]
    [string]$YtDlpManifestPath,
    [string]$ChecksumPath = "",
    [switch]$WriteChecksum
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedPackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
$resolvedManifestPath = (Resolve-Path -LiteralPath $YtDlpManifestPath).Path
$manifest = Get-Content -LiteralPath $resolvedManifestPath -Raw | ConvertFrom-Json
$inspectDir = Join-Path ([System.IO.Path]::GetTempPath()) ("media-dock-win-verify-" + [guid]::NewGuid().ToString("N"))
$runtimeVerifierPath = Join-Path $PSScriptRoot "windows-runtime-verifier.mjs"

if ($WriteChecksum) {
    if (-not $ChecksumPath) {
        throw "-WriteChecksum requires -ChecksumPath."
    }
    $checksumFileName = Split-Path -Leaf $ChecksumPath
    $checksumDirectory = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($ChecksumPath))
    $ChecksumPath = Join-Path $checksumDirectory $checksumFileName
    $packageDirectory = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($resolvedPackagePath))
    $manifestDirectory = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($resolvedManifestPath))
    if (
        $checksumFileName -ne "SHA256SUMS.txt" -or
        -not [System.StringComparer]::OrdinalIgnoreCase.Equals($checksumDirectory, $packageDirectory) -or
        -not [System.StringComparer]::OrdinalIgnoreCase.Equals($checksumDirectory, $manifestDirectory)
    ) {
        throw "Final checksums must be written as SHA256SUMS.txt next to the package and runtime manifest."
    }
    if (Test-Path -LiteralPath $ChecksumPath) {
        Remove-Item -LiteralPath $ChecksumPath -Force
    }
}

function Get-SingleRuntimeTool {
    param(
        [string]$RootPath,
        [string]$FileName
    )

    $matches = @(Get-ChildItem -LiteralPath $RootPath -Recurse -File -Filter $FileName)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one $FileName in the package, found $($matches.Count)."
    }
    if ($matches[0].Length -le 0) {
        throw "$FileName is empty in the package."
    }
    return $matches[0]
}

function Invoke-VersionSmokeTest {
    param(
        [System.IO.FileInfo]$Tool,
        [string[]]$Arguments,
        [string]$Label
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $Tool.FullName
    $startInfo.Arguments = $Arguments -join " "
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo

    try {
        if (-not $process.Start()) {
            throw "$Label version smoke test could not start."
        }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(30000)) {
            $process.Kill()
            throw "$Label version smoke test timed out."
        }
        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result
        $output = (($stdout, $stderr) -join "`n").Trim()
        if ($process.ExitCode -ne 0) {
            throw "$Label version smoke test failed with exit code $($process.ExitCode). Output: $output"
        }
        if ([string]::IsNullOrWhiteSpace($output)) {
            throw "$Label version smoke test returned no output."
        }
        Write-Host "[OK] $Label" ($output -split "`r?`n")[0]
        return $output
    }
    finally {
        $process.Dispose()
    }
}

function Test-ChecksumManifest {
    param(
        [string]$ManifestPath,
        [string[]]$RequiredPaths
    )

    $entries = @{}
    foreach ($line in Get-Content -LiteralPath $ManifestPath) {
        if ($line -match '^([a-fA-F0-9]{64})\s\s(.+)$') {
            $entries[$Matches[2]] = $Matches[1].ToLowerInvariant()
        }
    }

    foreach ($requiredPath in $RequiredPaths) {
        $name = Split-Path -Leaf $requiredPath
        if (-not $entries.ContainsKey($name)) {
            throw "SHA256SUMS.txt does not include $name."
        }
        $actual = (Get-FileHash -LiteralPath $requiredPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $entries[$name]) {
            throw "Checksum mismatch for $name."
        }
    }
}

function Write-ChecksumManifest {
    param(
        [string]$OutputPath,
        [string[]]$ArtifactPaths
    )

    $lines = $ArtifactPaths | ForEach-Object {
        $hash = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $(Split-Path -Leaf $_)"
    }
    $temporaryPath = "$OutputPath.tmp"
    $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
    try {
        [System.IO.File]::WriteAllLines($temporaryPath, $lines, $utf8NoBom)
        Move-Item -LiteralPath $temporaryPath -Destination $OutputPath -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}

try {
    & node $runtimeVerifierPath verify-official --manifest $resolvedManifestPath | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime manifest failed official yt-dlp verification."
    }
    New-Item -ItemType Directory -Force -Path $inspectDir | Out-Null
    Expand-Archive -LiteralPath $resolvedPackagePath -DestinationPath $inspectDir -Force

    $ytDlp = Get-SingleRuntimeTool -RootPath $inspectDir -FileName "yt-dlp.exe"
    $deno = Get-SingleRuntimeTool -RootPath $inspectDir -FileName "deno.exe"
    $ffmpeg = Get-SingleRuntimeTool -RootPath $inspectDir -FileName "ffmpeg.exe"
    $ffprobe = Get-SingleRuntimeTool -RootPath $inspectDir -FileName "ffprobe.exe"

    if ($ytDlp.DirectoryName -ne $deno.DirectoryName -or $ytDlp.DirectoryName -ne $ffmpeg.DirectoryName -or $ytDlp.DirectoryName -ne $ffprobe.DirectoryName) {
        throw "Packaged runtime executables are not located in the same tools directory."
    }

    & node $runtimeVerifierPath verify-runtime --manifest $resolvedManifestPath --runtime-dir $ytDlp.DirectoryName | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Packaged Windows runtime fingerprints do not match the staging manifest."
    }

    $ytDlpOutput = Invoke-VersionSmokeTest -Tool $ytDlp -Arguments @("--version") -Label "yt-dlp"
    $ytDlpVersion = ($ytDlpOutput -split "`r?`n")[0].Trim()
    if ($ytDlpVersion -ne [string]$manifest.version) {
        throw "Packaged yt-dlp version mismatch: expected $($manifest.version), received $ytDlpVersion."
    }
    Invoke-VersionSmokeTest -Tool $deno -Arguments @("--version") -Label "Deno" | Out-Null
    Invoke-VersionSmokeTest -Tool $ffmpeg -Arguments @("-version") -Label "ffmpeg" | Out-Null
    Invoke-VersionSmokeTest -Tool $ffprobe -Arguments @("-version") -Label "ffprobe" | Out-Null

    if ($WriteChecksum) {
        Write-ChecksumManifest -OutputPath $ChecksumPath -ArtifactPaths @($resolvedPackagePath, $resolvedManifestPath)
        Test-ChecksumManifest -ManifestPath $ChecksumPath -RequiredPaths @($resolvedPackagePath, $resolvedManifestPath)
        Write-Host "[OK] SHA256SUMS.txt generated after Windows smoke tests"
    }
    elseif ($ChecksumPath) {
        $resolvedChecksumPath = (Resolve-Path -LiteralPath $ChecksumPath).Path
        Test-ChecksumManifest -ManifestPath $resolvedChecksumPath -RequiredPaths @($resolvedPackagePath, $resolvedManifestPath)
        Write-Host "[OK] SHA256SUMS.txt"
    }

    Write-Host "Windows package runtime verification passed: $resolvedPackagePath"
}
finally {
    if (Test-Path -LiteralPath $inspectDir) {
        Remove-Item -LiteralPath $inspectDir -Recurse -Force
    }
}
