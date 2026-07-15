param(
    [Parameter(Mandatory = $true)]
    [string]$PackagePath,
    [Parameter(Mandatory = $true)]
    [string]$RuntimeManifestPath,
    [Parameter(Mandatory = $true)]
    [string]$SignatureReportPath,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedVersion,
    [string]$ChecksumPath = "",
    [switch]$WriteChecksum,
    [switch]$RequireSigned
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedPackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
$resolvedManifestPath = (Resolve-Path -LiteralPath $RuntimeManifestPath).Path
$manifest = Get-Content -LiteralPath $resolvedManifestPath -Raw | ConvertFrom-Json
$expectedWindowsVersionPrefix = ($ExpectedVersion -split '-', 2)[0]
if ($expectedWindowsVersionPrefix -notmatch '^\d+\.\d+\.\d+$') {
    throw "ExpectedVersion is not a supported semantic version: $ExpectedVersion"
}
$inspectDir = Join-Path ([System.IO.Path]::GetTempPath()) ("Media Dock 验证 " + [guid]::NewGuid().ToString("N"))
$runtimeVerifierPath = Join-Path $PSScriptRoot "windows-runtime-verifier.mjs"
$verificationSucceeded = $false
$signatureDirectory = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($SignatureReportPath))
$SignatureReportPath = Join-Path $signatureDirectory (Split-Path -Leaf $SignatureReportPath)

function Assert-ReleaseSiblingPath {
    param([string]$CandidatePath, [string]$ExpectedName)

    $candidateName = Split-Path -Leaf $CandidatePath
    $candidateDirectory = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($CandidatePath))
    $packageDirectory = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($resolvedPackagePath))
    if (
        $candidateName -ne $ExpectedName -or
        -not [System.StringComparer]::OrdinalIgnoreCase.Equals($candidateDirectory, $packageDirectory)
    ) {
        throw "$ExpectedName must be written next to the final package."
    }
}

Assert-ReleaseSiblingPath -CandidatePath $SignatureReportPath -ExpectedName "WINDOWS-SIGNATURES.json"
if (Test-Path -LiteralPath $SignatureReportPath) {
    Remove-Item -LiteralPath $SignatureReportPath -Force
}

if ($WriteChecksum) {
    if (-not $ChecksumPath) {
        throw "-WriteChecksum requires -ChecksumPath."
    }
    Assert-ReleaseSiblingPath -CandidatePath $ChecksumPath -ExpectedName "SHA256SUMS.txt"
    $ChecksumPath = [System.IO.Path]::GetFullPath($ChecksumPath)
    if (Test-Path -LiteralPath $ChecksumPath) {
        Remove-Item -LiteralPath $ChecksumPath -Force
    }
}

function Get-SingleFile {
    param([string]$RootPath, [string]$FileName)

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
    param([System.IO.FileInfo]$Tool, [string[]]$Arguments, [string]$Label)

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Tool.FullName
    $startInfo.Arguments = $Arguments -join " "
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw "$Label version smoke test could not start." }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(30000)) {
            $process.Kill()
            throw "$Label version smoke test timed out."
        }
        $output = (($stdoutTask.Result, $stderrTask.Result) -join "`n").Trim()
        if ($process.ExitCode -ne 0) {
            throw "$Label version smoke test failed with exit code $($process.ExitCode). Output: $output"
        }
        if ([string]::IsNullOrWhiteSpace($output)) { throw "$Label version smoke test returned no output." }
        Write-Host "[OK] $Label" ($output -split "`r?`n")[0]
        return $output
    }
    finally {
        $process.Dispose()
    }
}

function Invoke-ApplicationProbe {
    param(
        [System.IO.FileInfo]$Executable,
        [string]$PortableRoot,
        [int]$ExpectedExitCode,
        [ValidateSet("startup", "exit")]
        [string]$ProbeMode = "startup",
        [switch]$ExpectProbeFile
    )

    New-Item -ItemType Directory -Force -Path $PortableRoot | Out-Null
    $probeFileName = if ($ProbeMode -eq "exit") { "exit-probe.json" } else { "startup-probe.json" }
    $probePath = Join-Path $PortableRoot "Media Dock Data\$probeFileName"
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable.FullName
    $startInfo.WorkingDirectory = $Executable.DirectoryName
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.EnvironmentVariables["MEDIA_DOCK_PORTABLE_ROOT"] = $PortableRoot
    $probeEnvironmentName = if ($ProbeMode -eq "exit") { "MEDIA_DOCK_EXIT_PROBE" } else { "MEDIA_DOCK_STARTUP_PROBE" }
    $startInfo.EnvironmentVariables[$probeEnvironmentName] = "1"
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw "Media Dock startup probe could not start." }
        if (-not $process.WaitForExit(60000)) {
            $process.Kill()
            throw "Media Dock startup probe timed out."
        }
        if ($process.ExitCode -ne $ExpectedExitCode) {
            throw "Media Dock startup probe exited with $($process.ExitCode); expected $ExpectedExitCode."
        }
        if ($ExpectProbeFile -and -not (Test-Path -LiteralPath $probePath -PathType Leaf)) {
            throw "Media Dock did not write the portable startup probe: $probePath"
        }
        if ($ExpectProbeFile -and $ProbeMode -eq "exit") {
            $exitProbe = Get-Content -LiteralPath $probePath -Raw | ConvertFrom-Json
            if (-not $exitProbe.taskEngineClosed -or -not $exitProbe.ipcUnregistered) {
                throw "Media Dock exit probe did not close the task engine and IPC boundary."
            }
        }
        if ($ExpectProbeFile -and $ProbeMode -eq "startup") {
            $startupProbe = Get-Content -LiteralPath $probePath -Raw | ConvertFrom-Json
            if ([string]$startupProbe.appVersion -ne $ExpectedVersion) {
                throw "Packaged app version $($startupProbe.appVersion) does not match expected version $ExpectedVersion."
            }
        }
        if (-not $ExpectProbeFile -and (Test-Path -LiteralPath $probePath)) {
            throw "Media Dock wrote a startup probe even though the portable data location was invalid."
        }
    }
    finally {
        $process.Dispose()
    }
}

function Write-ChecksumManifest {
    param([string]$OutputPath, [string[]]$ArtifactPaths)

    $lines = $ArtifactPaths | ForEach-Object {
        $hash = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $(Split-Path -Leaf $_)"
    }
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($OutputPath, (($lines -join "`n") + "`n"), $utf8NoBom)
}

try {
    & node $runtimeVerifierPath verify-official --manifest $resolvedManifestPath | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Runtime manifest failed official yt-dlp verification." }

    New-Item -ItemType Directory -Force -Path $inspectDir | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($resolvedPackagePath, $inspectDir)

    $mainExecutable = Get-SingleFile -RootPath $inspectDir -FileName "Media Dock.exe"
    if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals($mainExecutable.DirectoryName, $inspectDir)) {
        throw "Media Dock.exe must be directly runnable from the extracted ZIP root."
    }

    $versionInfo = $mainExecutable.VersionInfo
    $metadataChecks = [ordered]@{
        ProductName = $versionInfo.ProductName
        FileDescription = $versionInfo.FileDescription
        CompanyName = $versionInfo.CompanyName
        ProductVersion = $versionInfo.ProductVersion
        FileVersion = $versionInfo.FileVersion
        OriginalFilename = $versionInfo.OriginalFilename
    }
    if ($versionInfo.ProductName -ne "Media Dock") { throw "Unexpected ProductName: $($versionInfo.ProductName)" }
    if ($versionInfo.FileDescription -ne "Media Dock") { throw "Unexpected FileDescription: $($versionInfo.FileDescription)" }
    if ($versionInfo.CompanyName -ne "Yifo") { throw "Unexpected CompanyName: $($versionInfo.CompanyName)" }
    if (-not $versionInfo.ProductVersion.StartsWith($expectedWindowsVersionPrefix)) { throw "Unexpected ProductVersion: $($versionInfo.ProductVersion)" }
    if (-not $versionInfo.FileVersion.StartsWith($expectedWindowsVersionPrefix)) { throw "Unexpected FileVersion: $($versionInfo.FileVersion)" }
    if ($versionInfo.FileVersion.StartsWith("41.7.0")) { throw "FileVersion still identifies the Electron runtime." }
    if ($versionInfo.OriginalFilename -eq "electron.exe") { throw "OriginalFilename still identifies electron.exe." }
    Write-Host "[OK] Windows executable identity" ($metadataChecks | ConvertTo-Json -Compress)

    $binaryFiles = @(Get-ChildItem -LiteralPath $inspectDir -Recurse -File | Where-Object { $_.Extension -in @(".exe", ".dll") })
    $signatureRecords = foreach ($binary in $binaryFiles) {
        $signature = Get-AuthenticodeSignature -LiteralPath $binary.FullName
        [ordered]@{
            path = $binary.FullName.Substring($inspectDir.Length).TrimStart([char[]]@('\', '/'))
            sha256 = (Get-FileHash -LiteralPath $binary.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            status = [string]$signature.Status
            statusMessage = $signature.StatusMessage
            signer = if ($null -ne $signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
            issuer = if ($null -ne $signature.SignerCertificate) { $signature.SignerCertificate.Issuer } else { $null }
            thumbprint = if ($null -ne $signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }
            timestampSigner = if ($null -ne $signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { $null }
            signerNotBefore = if ($null -ne $signature.SignerCertificate) { $signature.SignerCertificate.NotBefore.ToUniversalTime().ToString("o") } else { $null }
            signerNotAfter = if ($null -ne $signature.SignerCertificate) { $signature.SignerCertificate.NotAfter.ToUniversalTime().ToString("o") } else { $null }
            timestampThumbprint = if ($null -ne $signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Thumbprint } else { $null }
        }
    }
    $mainSignature = Get-AuthenticodeSignature -LiteralPath $mainExecutable.FullName
    if ($RequireSigned) {
        if ($mainSignature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
            throw "Signed release requires a valid Authenticode signature on Media Dock.exe; received $($mainSignature.Status)."
        }
        if ($null -eq $mainSignature.TimeStamperCertificate) {
            throw "Signed release requires an RFC 3161 timestamp on Media Dock.exe."
        }
        $unexpectedSignatureStates = @($signatureRecords | Where-Object { $_.status -notin @("Valid", "NotSigned") })
        if ($unexpectedSignatureStates.Count -gt 0) {
            $summary = ($unexpectedSignatureStates | ForEach-Object { "$($_.path)=$($_.status)" }) -join ", "
            throw "Signed release contains invalid or untrusted binary signatures: $summary"
        }
        if ((Split-Path -Leaf $resolvedPackagePath) -match "Unsigned-Developer-Preview") {
            throw "A signed release artifact must not carry the unsigned preview label."
        }
    }
    elseif ((Split-Path -Leaf $resolvedPackagePath) -notmatch "Unsigned-Developer-Preview") {
        throw "An unsigned candidate must be explicitly labeled Unsigned-Developer-Preview."
    }

    $signatureReport = [ordered]@{
        schemaVersion = 1
        package = Split-Path -Leaf $resolvedPackagePath
        generatedAt = [DateTime]::UtcNow.ToString("o")
        requireSigned = [bool]$RequireSigned
        executableMetadata = $metadataChecks
        binaries = @($signatureRecords)
    }
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($SignatureReportPath, (($signatureReport | ConvertTo-Json -Depth 8) + "`n"), $utf8NoBom)
    Write-Host "[OK] Authenticode inventory" $SignatureReportPath

    $ytDlp = Get-SingleFile -RootPath $inspectDir -FileName "yt-dlp.exe"
    $deno = Get-SingleFile -RootPath $inspectDir -FileName "deno.exe"
    $ffmpeg = Get-SingleFile -RootPath $inspectDir -FileName "ffmpeg.exe"
    $ffprobe = Get-SingleFile -RootPath $inspectDir -FileName "ffprobe.exe"
    if ($ytDlp.DirectoryName -ne $deno.DirectoryName -or $ytDlp.DirectoryName -ne $ffmpeg.DirectoryName -or $ytDlp.DirectoryName -ne $ffprobe.DirectoryName) {
        throw "Packaged runtime executables are not located in the same tools directory."
    }
    & node $runtimeVerifierPath verify-runtime --manifest $resolvedManifestPath --runtime-dir $ytDlp.DirectoryName | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Packaged Windows runtime fingerprints do not match the staging manifest." }

    $ytDlpOutput = Invoke-VersionSmokeTest -Tool $ytDlp -Arguments @("--version") -Label "yt-dlp"
    if (($ytDlpOutput -split "`r?`n")[0].Trim() -ne [string]$manifest.version) {
        throw "Packaged yt-dlp version does not match the runtime manifest."
    }
    Invoke-VersionSmokeTest -Tool $deno -Arguments @("--version") -Label "Deno" | Out-Null
    Invoke-VersionSmokeTest -Tool $ffmpeg -Arguments @("-version") -Label "ffmpeg" | Out-Null
    Invoke-VersionSmokeTest -Tool $ffprobe -Arguments @("-version") -Label "ffprobe" | Out-Null

    $writableRoot = Join-Path $inspectDir "便携 数据 测试"
    Invoke-ApplicationProbe -Executable $mainExecutable -PortableRoot $writableRoot -ExpectedExitCode 0 -ExpectProbeFile
    $exitRoot = Join-Path $inspectDir "退出 清理 测试"
    Invoke-ApplicationProbe -Executable $mainExecutable -PortableRoot $exitRoot -ExpectedExitCode 0 -ProbeMode "exit" -ExpectProbeFile
    Write-Host "[OK] Startup, portable write, and exit cleanup probes"

    $blockedRoot = Join-Path $inspectDir "只读 数据 测试"
    New-Item -ItemType Directory -Force -Path $blockedRoot | Out-Null
    $currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $blockedRoot /deny "${currentIdentity}:(OI)(CI)(W)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not create the native Windows write-denied directory fixture." }
    try {
        Invoke-ApplicationProbe -Executable $mainExecutable -PortableRoot $blockedRoot -ExpectedExitCode 1
    }
    finally {
        & icacls.exe $blockedRoot /remove:d $currentIdentity | Out-Null
    }
    Write-Host "[OK] Native write-denied portable data location fails clearly"

    if ($WriteChecksum) {
        Write-ChecksumManifest -OutputPath $ChecksumPath -ArtifactPaths @($resolvedPackagePath, $resolvedManifestPath, $SignatureReportPath)
        Write-Host "[OK] SHA256SUMS.txt generated after native Windows verification"
    }

    $verificationSucceeded = $true
    Write-Host "Windows package verification passed: $resolvedPackagePath"
}
finally {
    if (Test-Path -LiteralPath $inspectDir) {
        Remove-Item -LiteralPath $inspectDir -Recurse -Force
    }
    if (-not $verificationSucceeded) {
        if (Test-Path -LiteralPath $SignatureReportPath) { Remove-Item -LiteralPath $SignatureReportPath -Force }
        if ($ChecksumPath -and (Test-Path -LiteralPath $ChecksumPath)) { Remove-Item -LiteralPath $ChecksumPath -Force }
    }
}
