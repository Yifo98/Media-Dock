param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$EnvScriptsDir = "",
    [string]$YtDlpStandaloneUrl = "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$toolsDir = Join-Path $ProjectRoot "tools"
$releaseDir = Join-Path $ProjectRoot "release"
$shareRoot = Join-Path $releaseDir "share"
$shareZip = Join-Path $releaseDir "Media-Dock-share.zip"

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

$requiredFiles = @(
    "ffmpeg.exe",
    "ffprobe.exe"
)

if (-not $EnvScriptsDir) {
    $envRoot = if ($env:YTDLP_ENV_ROOT) { $env:YTDLP_ENV_ROOT } else { Join-Path $HOME ".conda\envs\yt-dlp" }
    $EnvScriptsDir = Join-Path $envRoot "Scripts"
}

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

foreach ($fileName in $requiredFiles) {
    $sourcePath = Join-Path $EnvScriptsDir $fileName
    if (-not (Test-Path $sourcePath)) {
        throw "Required tool not found: $sourcePath"
    }

    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $toolsDir $fileName) -Force
}

$ytDlpDestination = Join-Path $toolsDir "yt-dlp.exe"
Write-Host "Downloading standalone yt-dlp.exe..."
Invoke-WebRequest -Uri $YtDlpStandaloneUrl -OutFile $ytDlpDestination

Push-Location $ProjectRoot
try {
    npm run build | Out-Host
    npx electron-builder --dir | Out-Host
}
finally {
    Pop-Location
}

$unpackedDir = Join-Path $releaseDir "win-unpacked"
if (-not (Test-Path $unpackedDir)) {
    throw "Portable app folder not found: $unpackedDir"
}

if (Test-Path $shareRoot) {
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
    if (Test-Path $candidate) {
        Remove-Item -LiteralPath $candidate -Recurse -Force
    }
}

if (Test-Path $shareZip) {
    Remove-Item -LiteralPath $shareZip -Force
}

New-ZipArchive -SourcePath (Join-Path $shareRoot "Media Dock") -DestinationPath $shareZip

$privacyPattern = 'cookie|history|config\.json|user[- ]data|electron-session|electron-user-data|subtitle-cleanup-config|api[_-]?key|Media Dock Data|app-cache'
$tempInspectDir = Join-Path $releaseDir "_inspect"

if (Test-Path $tempInspectDir) {
    Remove-Item -LiteralPath $tempInspectDir -Recurse -Force
}

Expand-ZipArchive -ArchivePath $shareZip -DestinationPath $tempInspectDir

try {
    $sensitive = Get-ChildItem -LiteralPath $tempInspectDir -Recurse -File | Where-Object {
        $_.FullName -match $privacyPattern
    }

    if ($sensitive) {
        throw "Sensitive files were detected inside the Windows share zip."
    }
}
finally {
    if (Test-Path $tempInspectDir) {
        Remove-Item -LiteralPath $tempInspectDir -Recurse -Force
    }
}

Write-Host ""
Write-Host "Shareable package is ready:"
Write-Host $shareZip
