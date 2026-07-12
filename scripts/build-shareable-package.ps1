param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$EnvScriptsDir = "",
    [string]$DenoPath = "",
    [string]$YtDlpVersion = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$toolsRoot = Join-Path $ProjectRoot "tools"
$toolsDir = Join-Path $toolsRoot "bin"
$releaseDir = Join-Path $ProjectRoot "release"
$shareRoot = Join-Path $releaseDir "share"
$shareZip = Join-Path $releaseDir "Media-Dock-share.zip"
$runtimeManifestPath = Join-Path $releaseDir "YT-DLP-WINDOWS.json"
$checksumsPath = Join-Path $releaseDir "SHA256SUMS.txt"
$runtimeVerifierPath = Join-Path $PSScriptRoot "windows-runtime-verifier.mjs"

function Get-BandizipPath {
    $candidates = @()
    if ($env:BANDIZIP_BIN) {
        $candidates += $env:BANDIZIP_BIN
    }
    if ($env:ProgramFiles) {
        $candidates += (Join-Path $env:ProgramFiles "Bandizip\bz.exe")
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} "Bandizip\bz.exe")
    }

    $pathCandidate = Get-Command "bz.exe" -ErrorAction SilentlyContinue
    if ($pathCandidate) {
        $candidates += $pathCandidate.Source
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    return $null
}

function New-ZipArchive {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )

    $bandizip = Get-BandizipPath
    if ($bandizip) {
        & $bandizip c -y -fmt:zip -storeroot:yes $DestinationPath $SourcePath | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Bandizip compression failed with exit code $LASTEXITCODE."
        }
        return
    }

    Compress-Archive -Path $SourcePath -DestinationPath $DestinationPath -Force
}

function Expand-ZipArchive {
    param(
        [string]$ArchivePath,
        [string]$DestinationPath
    )

    $bandizip = Get-BandizipPath
    if ($bandizip) {
        & $bandizip x -y -aoa "-o:$DestinationPath" $ArchivePath | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Bandizip extraction failed with exit code $LASTEXITCODE."
        }
        return
    }

    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $DestinationPath -Force
}

$requiredFiles = @("ffmpeg.exe", "ffprobe.exe")

if (-not $EnvScriptsDir) {
    $envRoot = if ($env:YTDLP_ENV_ROOT) { $env:YTDLP_ENV_ROOT } else { Join-Path $HOME ".conda\envs\yt-dlp" }
    $EnvScriptsDir = Join-Path $envRoot "Scripts"
}

foreach ($stalePath in @($runtimeManifestPath, $checksumsPath)) {
    if (Test-Path -LiteralPath $stalePath) {
        Remove-Item -LiteralPath $stalePath -Force
    }
}
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
if (Test-Path -LiteralPath $toolsDir) {
    Remove-Item -LiteralPath $toolsDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

foreach ($fileName in $requiredFiles) {
    $sourcePath = Join-Path $EnvScriptsDir $fileName
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Required tool not found: $sourcePath"
    }
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $toolsDir $fileName) -Force
}
Get-ChildItem -LiteralPath $EnvScriptsDir -File -Filter "*.dll" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $toolsDir $_.Name) -Force
}

$denoCandidates = @($DenoPath, $env:DENO_BIN, (Join-Path $EnvScriptsDir "deno.exe"))
$denoCommand = Get-Command "deno.exe" -ErrorAction SilentlyContinue
if ($denoCommand) {
    $denoCandidates += $denoCommand.Source
}
$resolvedDenoPath = $denoCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $resolvedDenoPath) {
    throw "Required tool deno.exe was not found. Pass -DenoPath or set DENO_BIN."
}
Copy-Item -LiteralPath $resolvedDenoPath -Destination (Join-Path $toolsDir "deno.exe") -Force

$resolveArguments = @($runtimeVerifierPath, "resolve", "--output", $runtimeManifestPath)
if ($YtDlpVersion) {
    $resolveArguments += @("--version", $YtDlpVersion)
}
& node @resolveArguments | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Could not resolve official yt-dlp release metadata."
}
$runtimeManifest = Get-Content -LiteralPath $runtimeManifestPath -Raw | ConvertFrom-Json
$resolvedYtDlpVersion = [string]$runtimeManifest.version
$ytDlpUrl = [string]$runtimeManifest.assetUrl

$ytDlpDestination = Join-Path $toolsDir "yt-dlp.exe"
Write-Host "Downloading official yt-dlp.exe $resolvedYtDlpVersion..."
Invoke-WebRequest -Uri $ytDlpUrl -OutFile $ytDlpDestination
& node $runtimeVerifierPath verify-file --manifest $runtimeManifestPath --file $ytDlpDestination | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Downloaded yt-dlp.exe failed official size or SHA-256 validation."
}

& node $runtimeVerifierPath record-runtime --manifest $runtimeManifestPath --runtime-dir $toolsDir | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Could not record Windows runtime fingerprints."
}

Push-Location $ProjectRoot
try {
    npm run build | Out-Host
    npx electron-builder --dir | Out-Host
}
finally {
    Pop-Location
}

$unpackedDir = Join-Path $releaseDir "win-unpacked"
if (-not (Test-Path -LiteralPath $unpackedDir)) {
    throw "Portable app folder not found: $unpackedDir"
}

if (Test-Path -LiteralPath $shareRoot) {
    Remove-Item -LiteralPath $shareRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $shareRoot | Out-Null
Copy-Item -LiteralPath $unpackedDir -Destination (Join-Path $shareRoot "Media Dock") -Recurse -Force

$portableAppDir = Join-Path $shareRoot "Media Dock"
$userDataCandidates = @(
    (Join-Path $portableAppDir "user-data"),
    (Join-Path $portableAppDir "User Data"),
    (Join-Path $portableAppDir "cookies"),
    (Join-Path $portableAppDir "electron-session"),
    (Join-Path $portableAppDir "electron-user-data")
)
foreach ($candidate in $userDataCandidates) {
    if (Test-Path -LiteralPath $candidate) {
        Remove-Item -LiteralPath $candidate -Recurse -Force
    }
}

if (Test-Path -LiteralPath $shareZip) {
    Remove-Item -LiteralPath $shareZip -Force
}
New-ZipArchive -SourcePath (Join-Path $shareRoot "Media Dock") -DestinationPath $shareZip

$privacyPattern = 'cookie|history|config\.json|user[- ]data|electron-session|electron-user-data|subtitle-cleanup-config|api[_-]?key|Media Dock Data|app-cache'
$tempInspectDir = Join-Path $releaseDir "_inspect"
if (Test-Path -LiteralPath $tempInspectDir) {
    Remove-Item -LiteralPath $tempInspectDir -Recurse -Force
}
Expand-ZipArchive -ArchivePath $shareZip -DestinationPath $tempInspectDir
try {
    $sensitive = Get-ChildItem -LiteralPath $tempInspectDir -Recurse -File | Where-Object { $_.FullName -match $privacyPattern }
    if ($sensitive) {
        throw "Sensitive files were detected inside the Windows share zip."
    }
}
finally {
    if (Test-Path -LiteralPath $tempInspectDir) {
        Remove-Item -LiteralPath $tempInspectDir -Recurse -Force
    }
}

$verificationParameters = @{
    PackagePath = $shareZip
    YtDlpManifestPath = $runtimeManifestPath
    ChecksumPath = $checksumsPath
    WriteChecksum = $true
}
& (Join-Path $PSScriptRoot "verify-windows-package.ps1") @verificationParameters

Write-Host ""
Write-Host "Verified shareable package is ready:"
Write-Host $shareZip
Write-Host $runtimeManifestPath
Write-Host $checksumsPath
