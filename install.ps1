#Requires -Version 5.1
<#
.SYNOPSIS
    ClawGod Bootstrapper for Windows
.DESCRIPTION
    Installs the ClawGod CLI and delegates to it.
#>
param(
    [string]$Version = "latest",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try { chcp 65001 | Out-Null } catch {}

$ClawDir = Join-Path $env:USERPROFILE ".clawgod"
$BinDir  = Join-Path $env:USERPROFILE ".local\bin"

function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "  [ERR] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "  ClawGod Installer" -ForegroundColor White -NoNewline
Write-Host " (Windows)" -ForegroundColor DarkGray
Write-Host ""

# ─── Prerequisites ────────────────────────────────────

try { $null = Get-Command node -ErrorAction Stop }
catch {
    Write-Err "Node.js is required (>= 18). Install from https://nodejs.org"
    exit 1
}

$nodeVer = [int](node -e "console.log(process.versions.node.split('.')[0])")
if ($nodeVer -lt 18) {
    Write-Err "Node.js >= 18 required (found v$nodeVer)"
    exit 1
}

try { $null = Get-Command npm -ErrorAction Stop }
catch {
    Write-Err "npm is required"
    exit 1
}

# ─── Install / Update ClawGod CLI ─────────────────────

New-Item -ItemType Directory -Force -Path $ClawDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir  | Out-Null

$TmpDir = Join-Path $env:TEMP ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

# Download latest source
$ZipUrl = "https://github.com/0Chencc/clawgod/archive/refs/heads/main.zip"
$ZipPath = Join-Path $TmpDir "clawgod.zip"

if (Test-Path (Join-Path $PWD ".git")) {
    # Running from repo
    Copy-Item -Recurse -Force "$(Join-Path $PWD 'bin')" $ClawDir
    Copy-Item -Recurse -Force "$(Join-Path $PWD 'src')" $ClawDir
    Copy-Item -Force "$(Join-Path $PWD 'package.json')" $ClawDir
} else {
    Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
    Expand-Archive -Path $ZipPath -DestinationPath $TmpDir -Force
    Copy-Item -Recurse -Force "$(Join-Path $TmpDir 'clawgod-main\bin')" $ClawDir
    Copy-Item -Recurse -Force "$(Join-Path $TmpDir 'clawgod-main\src')" $ClawDir
    Copy-Item -Force "$(Join-Path $TmpDir 'clawgod-main\package.json')" $ClawDir
}

Remove-Item -Recurse -Force $TmpDir

# Install launcher
$Launcher = Join-Path $BinDir "clawgod.cmd"
Set-Content -Path $Launcher -Value "@echo off`r`nnode `"$ClawDir\bin\clawgod.mjs`" %*" -Encoding ASCII
Write-OK "ClawGod CLI installed ($Launcher)"

# ─── Uninstall or Install ─────────────────────────────

if ($Uninstall) {
    & $Launcher uninstall
    Remove-Item -Force $Launcher
    Write-Err "ClawGod uninstalled"
} else {
    & $Launcher install --version $Version
}
