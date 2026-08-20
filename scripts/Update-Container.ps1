#requires -Version 7.0
<#
.SYNOPSIS
    Keeps the notes-interface container on the latest main branch, with no
    one needing to run git or docker commands by hand.

.DESCRIPTION
    Run this on a schedule (Task Scheduler, e.g. hourly):
      1. Fetches origin/main. If the repo is already up to date, does
         nothing else - no rebuild, no restart, nothing beyond a log line.
      2. If the working tree has uncommitted changes, does nothing and
         warns instead - never pulls or discards local edits. That
         shouldn't happen on a deployment checkout, but if it does, this
         script is not the place to resolve it.
      3. Otherwise: git pull, then `docker compose up -d --build`, which
         rebuilds and recreates the container only because the image
         actually changed.

    Unlike Invoke-NoteProcessor-v2.ps1, this script has no DPAPI
    dependency (git and docker don't need the decrypted Gemini key), so
    the scheduled task can use "Run whether user is logged on or not" -
    it works even if nobody is logged into the machine when it fires.

.EXAMPLE
    .\Update-Container.ps1 -DryRun
    .\Update-Container.ps1
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\Users\Steven\Documents\GitHub\Notes-System',
    [string]$SystemRoot = 'E:\notes-system',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$LogDir   = Join-Path $SystemRoot 'logs'
$LogPath  = Join-Path $LogDir ("update-container-{0:yyyy-MM-dd}.log" -f (Get-Date))
# Outside $RepoRoot on purpose - a lock file living inside the git checkout
# would show up as an untracked file on the very next run and make the
# "is the tree clean" check below abort every update after the first one.
$LockPath = Join-Path $SystemRoot 'update.lock'
$StaleLockMinutes = 30

function Write-Log {
    param(
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO'
    )
    $line = "{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}" -f (Get-Date), $Level, $Message
    Write-Host $line
    if (-not $DryRun) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
        Add-Content -LiteralPath $LogPath -Value $line -Encoding utf8
    }
}

function Invoke-Git {
    param([Parameter(Mandatory)][string[]]$GitArgs)
    $output = & git @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed: $output"
    }
    return $output
}

# --- Re-entrancy guard, same pattern as the note processor's .lock -----------
if (Test-Path -LiteralPath $LockPath) {
    $lockAge = (Get-Date) - (Get-Item -LiteralPath $LockPath).LastWriteTime
    if ($lockAge.TotalMinutes -lt $StaleLockMinutes) {
        Write-Log "Another update run holds the lock (age $([int]$lockAge.TotalMinutes)m). Exiting." 'WARN'
        exit 0
    }
    Write-Log "Stale lock ($([int]$lockAge.TotalMinutes)m old) - taking over." 'WARN'
    Remove-Item -LiteralPath $LockPath -Force
}
if (-not $DryRun) {
    New-Item -ItemType Directory -Path $SystemRoot -Force | Out-Null
    New-Item -ItemType File -Path $LockPath -Force | Out-Null
}

try {
    Push-Location -LiteralPath $RepoRoot
    try {
        # Never touch a dirty tree - an uncommitted local edit is someone's
        # in-progress work, not something this script gets to overwrite.
        $dirty = Invoke-Git -GitArgs @('status', '--porcelain')
        if ($dirty) {
            Write-Log "Working tree has uncommitted changes - skipping update. Resolve manually." 'WARN'
            return
        }

        Invoke-Git -GitArgs @('fetch', 'origin', 'main') | Out-Null

        $local = (Invoke-Git -GitArgs @('rev-parse', 'HEAD')).Trim()
        $remote = (Invoke-Git -GitArgs @('rev-parse', 'origin/main')).Trim()

        if ($local -eq $remote) {
            Write-Log "Already up to date ($($local.Substring(0, 7)))."
            return
        }

        Write-Log "Update available: $($local.Substring(0, 7)) -> $($remote.Substring(0, 7))"

        if ($DryRun) {
            Write-Log "-DryRun: would pull and rebuild. Stopping here."
            return
        }

        Invoke-Git -GitArgs @('pull', 'origin', 'main') | Out-Null
        Write-Log "Pulled. Rebuilding and restarting the container..."

        $composeOutput = & docker compose up -d --build 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "docker compose up failed: $composeOutput"
        }
        Write-Log "Container updated and running at $($remote.Substring(0, 7))."
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Log "Update failed: $_" 'ERROR'
    throw
}
finally {
    if (-not $DryRun) { Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue }
}
