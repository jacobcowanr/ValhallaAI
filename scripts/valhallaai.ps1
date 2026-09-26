# ValhallaAI launcher (Windows).
#
# Mirrors scripts/valhallaai (macOS/Linux) command-for-command, including the
# pointer-file it writes for project_dir_pointer() in main.rs -- that
# function reads %APPDATA%\com.valhallaai.app\project_dir on Windows,
# so a bundled .exe launched from outside the checkout (Start Menu, a
# desktop shortcut) can still find .env, vault/, and the agent scripts.
#
#   valhallaai.ps1          open the app
#   valhallaai.ps1 dev      force the dev build even if a release build exists
#   valhallaai.ps1 build    produce a release build, after which opening is
#                           instant and does not hold a terminal
#   valhallaai.ps1 relay    start the vault relay (stop: valhallaai.ps1 relay stop)

$ErrorActionPreference = "Stop"

function Die($msg) {
    Write-Error "valhallaai: $msg"
    exit 1
}

function Need($cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Die "$cmd is not installed or not on PATH."
    }
}

# This script's own location, resolved through symlinks the same way the
# POSIX launcher is, so the project directory is found no matter where the
# checkout lives.
$Self = $MyInvocation.MyCommand.Path
$Item = Get-Item -LiteralPath $Self
while ($Item.LinkType) {
    $Self = $Item.Target[0]
    $Item = Get-Item -LiteralPath $Self
}
$ProjectDir = (Resolve-Path (Join-Path (Split-Path $Self -Parent) "..")).Path

# Record where the checkout is, for a release build launched from outside it
# (Start Menu, a desktop shortcut) -- same reasoning as the pointer file the
# macOS/Linux launcher writes, and read by the same project_dir_pointer() in
# main.rs, which on Windows resolves to $env:APPDATA.
$PointerDir = Join-Path $env:APPDATA "com.valhallaai.app"
try {
    New-Item -ItemType Directory -Force -Path $PointerDir | Out-Null
    Set-Content -Path (Join-Path $PointerDir "project_dir") -Value $ProjectDir -NoNewline
} catch {
    # Non-fatal: dev builds and terminal runs still get it via the env var below.
}

$env:VALHALLAAI_PROJECT_DIR = $ProjectDir

$Command = if ($args.Count -gt 0) { $args[0] } else { "open" }

switch ($Command) {
    "open" {
        # A release build starts instantly and does not tie up a terminal, so
        # prefer it when one exists. Named from productName in
        # tauri.conf.json ("ValhallaAI"), not hardcoded as "app", so a rename
        # cannot silently fall back to the dev build forever.
        $Exe = Join-Path $ProjectDir "src-tauri\target\release\valhallaai.exe"
        if (Test-Path $Exe) {
            Start-Process $Exe
            exit 0
        }
        Write-Host "No release build yet -- starting the dev app. Ctrl+C to stop."
        Write-Host "Run '.\valhallaai.ps1 build' once to get a launchable app instead."
        Need "npm"
        Push-Location $ProjectDir
        try { npm run tauri-dev } finally { Pop-Location }
    }
    "dev" {
        Need "npm"
        Push-Location $ProjectDir
        try { npm run tauri-dev } finally { Pop-Location }
    }
    "build" {
        Need "npm"
        Need "cargo"
        Push-Location $ProjectDir
        try { npm run tauri-build } finally { Pop-Location }
        Write-Host ""
        Write-Host "Built. '.\valhallaai.ps1' now opens it directly."
    }
    "relay" {
        Need "docker"
        $Compose = @("compose", "-f", (Join-Path $ProjectDir "docker-compose.local.yml"))
        $Sub = if ($args.Count -gt 1) { $args[1] } else { "start" }
        if ($Sub -eq "stop") {
            docker @Compose stop vault-relay
        } else {
            Write-Host "Starting the vault relay. It folds agent outboxes into"
            Write-Host "AGENT_SYNC.md and commits. Stop it with: valhallaai.ps1 relay stop"
            docker @Compose --profile optional up -d vault-relay
        }
    }
    { $_ -in "-h", "--help", "help" } {
        Write-Host "ValhallaAI launcher"
        Write-Host ""
        Get-Content $Self | Where-Object { $_ -match "^#   valhallaai" } | ForEach-Object {
            $_ -replace "^#   ", "  "
        }
    }
    default {
        Die "unknown command '$Command'. Try: valhallaai.ps1 --help"
    }
}
