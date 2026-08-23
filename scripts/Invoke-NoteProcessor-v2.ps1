#requires -Version 7.0
<#
.SYNOPSIS
    Note processor v0.2 - classify, file, and queue. No external execution.

.DESCRIPTION
    Pipeline per capture:
      _Inbox -> processing -> classify (Gemini) -> enrich (Gemini) -> queue -> Archive\Captures

    Routing:
      Every item becomes one JSON row in queue\pending. todo and grocery are
      tasks and are queued as-is. Every other category (lookup, project,
      recipe, idea, media, reference, unclassified) is also enriched before
      it is queued - answered, summarized, converted, or researched,
      whichever fits the item.

    Failure handling:
      Transient (HTTP 429/5xx, network) -> file stays in processing\ and is
        retried next run, up to MaxAttempts, then moved to failed\.
      Permanent (no frontmatter, empty body, unparseable JSON) -> failed\
        immediately, with a .reason.txt beside it.

    Guards that do not depend on model behaviour:
      - automation_candidate is never acted on. It is recorded as
        proposed_automation and stripped unless the category is in
        $AutomationAllowedCategories AND the slug is in $AllowedAutomations,
        which is empty until phase 4 fills it deliberately.
      - url is validated as an absolute http(s) URL before use.
      - body content is hashed; a repeat hash is archived as a duplicate
        without being filed or queued again.
      - When the capture was truncated before classification, the ORIGINAL
        text is filed, never the model's shortened body.

    Structure:
      This script is the orchestrator - params, paths, the Setup section,
      and the main per-capture loop. The four concerns that used to live
      here as functions (classification, enrichment/art lookups,
      ledger/queue persistence, and the retry/failure state machine) are
      dot-sourced from lib\ below, so a bug in one no longer has to touch
      the same file as the other three (architecture review 2026-08-23,
      candidate c7).

.EXAMPLE
    .\Invoke-NoteProcessor.ps1 -Model gemini-3.1-flash-lite -EnrichModel gemini-3.5-flash -DryRun
    .\Invoke-NoteProcessor.ps1 -Model gemini-3.1-flash-lite -EnrichModel gemini-3.5-flash
#>
[CmdletBinding()]
param(
    [string]$VaultRoot       = 'E:\notes',
    [string]$SystemRoot      = 'E:\notes-system',
    [string]$PromptPath      = 'E:\notes-system\scripts\classify-prompt.md',
    [string]$EnrichPromptPath = 'E:\notes-system\scripts\enrich-prompt.md',
    [string]$KeyPath         = 'E:\notes-system\gemini.key.xml',
    [string]$TmdbKeyPath     = 'E:\notes-system\tmdb.key.xml',
    [string]$SteamGridDbKeyPath = 'E:\notes-system\steamgriddb.key.xml',
    [Parameter(Mandatory)][string]$Model,
    [string]$EnrichModel     = 'gemini-3.5-flash',
    [int]$BodyLimit      = 800,
    [int]$ThinkingBudget = -1,
    [int]$MaxAttempts    = 5,
    [int]$DelaySeconds   = 2,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProcessorVersion = '0.2'
$SettleSeconds    = 15
$StaleLockMinutes = 30

# Sent on Interactions API calls. The API's May 2026 schema migration made
# this a no-op after the June 8 2026 sunset, but it costs nothing to send and
# documents which schema this script was written against.
$InteractionsApiRevision = '2026-05-20'

# --- Routing policy ----------------------------------------------------------

# todo and grocery are tasks: acted on, not researched. Every other category
# gets enrichment before it is queued.
$TaskCategories = @('todo','grocery')
$AllCategories  = @('lookup','todo','project','recipe','idea',
                     'media','reference','grocery','unclassified')

# Phase 4 fills these. Until then every proposed automation is recorded and
# discarded - the model has been observed proposing candidates on notes about
# configuring automations, which is exactly what this guard exists to stop.
$AutomationAllowedCategories = @('todo','grocery')
$AllowedAutomations          = @()

# --- Paths -------------------------------------------------------------------

$InboxDir      = Join-Path $VaultRoot  '_Inbox'
$ArchiveDir    = Join-Path $VaultRoot  'Archive\Captures'
$ProcessingDir = Join-Path $SystemRoot 'processing'
$FailedDir     = Join-Path $SystemRoot 'failed'
$QueuePending  = Join-Path $SystemRoot 'queue\pending'
$LogDir        = Join-Path $SystemRoot 'logs'
$LedgerPath    = Join-Path $SystemRoot 'ledger.jsonl'
$LockPath      = Join-Path $SystemRoot '.lock'
$LogPath       = Join-Path $LogDir ("processor-{0:yyyy-MM-dd}.log" -f (Get-Date))

# --- Concern modules -----------------------------------------------------------
#
# Dot-sourced into this script's own scope, so every function below reads
# this script's own $DryRun/$LogPath/etc. exactly as if it were still
# defined right here - PowerShell resolves a function call and a
# script-scope variable read at call time, not at dot-source time, so
# neither this order nor the cross-module calls between them (e.g.
# Persistence's Invoke-ReenrichRequests calling Enrichment's
# Invoke-Enrichment) need special handling.
foreach ($lib in 'Common', 'Classification', 'Enrichment', 'Persistence', 'RetryState') {
    . (Join-Path $PSScriptRoot "lib\$lib.ps1")
}

# --- Setup -------------------------------------------------------------------

# Deliberately not gated behind -DryRun: these are empty structural
# directories from PROJECT.md 4.1/4.2's fixed layout, not data - creating one
# that was already supposed to exist touches nothing a real run would
# produce. Test-Sandbox.ps1 depends on this: it only pre-creates the
# vault-side _Inbox/Archive\Captures itself and relies on the processor to
# create the system-side working directories below (processing\, failed\,
# queue\pending\, logs\) on every run, dry or live, so the rest of the
# pipeline (Get-ChildItem below, log writing) has somewhere to read/write
# even when nothing else gets written this run.
foreach ($dir in @($InboxDir, $ArchiveDir, $ProcessingDir, $FailedDir,
                   $QueuePending, $LogDir)) {
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

foreach ($p in @($PromptPath, $EnrichPromptPath)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "Missing required file: $p" }
}
$script:SystemPrompt       = Get-Content -LiteralPath $PromptPath -Raw
$script:EnrichSystemPrompt = Get-Content -LiteralPath $EnrichPromptPath -Raw

# The DPAPI file is the production path (Rule 4: secrets in DPAPI files or
# environment variables). The env var exists so this script can also run
# somewhere DPAPI can't decrypt - anywhere off the machine and account that
# created the key file, including a Linux sandbox.
if ($env:GEMINI_API_KEY) {
    $script:ApiKey = $env:GEMINI_API_KEY
}
elseif (Test-Path -LiteralPath $KeyPath) {
    $script:ApiKey = Get-DecryptedSecret -Path $KeyPath
}
else {
    throw "No API key available. Set `$env:GEMINI_API_KEY or provide -KeyPath $KeyPath."
}

# Optional, unlike the Gemini key above - TMDB only powers the media poster/
# backdrop lookup (9.2), and a missing key just means media items keep the
# frontend's placeholder art, the same best-effort posture as Seerr/Tandoor.
if ($env:TMDB_API_KEY) {
    $script:TmdbApiKey = $env:TMDB_API_KEY
}
elseif (Test-Path -LiteralPath $TmdbKeyPath) {
    $script:TmdbApiKey = Get-DecryptedSecret -Path $TmdbKeyPath
}
else {
    $script:TmdbApiKey = $null
    Write-Log "TMDB not configured (`$env:TMDB_API_KEY or $TmdbKeyPath) - media items will not get a poster/backdrop image." 'WARN'
}

# Same optional, best-effort posture as TMDB above, for the game/movie
# split TMDB can't cover on its own (9.2).
if ($env:STEAMGRIDDB_API_KEY) {
    $script:SteamGridDbApiKey = $env:STEAMGRIDDB_API_KEY
}
elseif (Test-Path -LiteralPath $SteamGridDbKeyPath) {
    $script:SteamGridDbApiKey = Get-DecryptedSecret -Path $SteamGridDbKeyPath
}
else {
    $script:SteamGridDbApiKey = $null
    Write-Log "SteamGridDB not configured (`$env:STEAMGRIDDB_API_KEY or $SteamGridDbKeyPath) - game items will not get a cover/hero image." 'WARN'
}

if (Test-Path -LiteralPath $LockPath) {
    $lockAge = (Get-Date) - (Get-Item -LiteralPath $LockPath).LastWriteTime
    if ($lockAge.TotalMinutes -lt $StaleLockMinutes) {
        Write-Log "Another run holds the lock (age $([int]$lockAge.TotalMinutes)m). Exiting." 'WARN'
        exit 0
    }
    Write-Log "Stale lock ($([int]$lockAge.TotalMinutes)m old) - taking over." 'WARN'
    Remove-Item -LiteralPath $LockPath -Force
}
if (-not $DryRun) { Set-Content -LiteralPath $LockPath -Value $PID -Encoding utf8 }

$stats = @{ Seen=0; Queued=0; EnrichFailed=0; Duplicate=0; Skipped=0; Failed=0; Deferred=0; NotSettled=0
            Reenriched=0; ReenrichFailed=0 }

try {
    Write-Log "Processor $ProcessorVersion starting. Model=$Model DryRun=$DryRun"
    $state = Get-ProcessedState -Path $LedgerPath
    Write-Log "Ledger holds $($state.Ids.Count) id(s), $($state.Hashes.Count) hash(es)."

    # Retries first: anything left in processing\ is an unfinished earlier run.
    $retries = @(Get-ChildItem -LiteralPath $ProcessingDir -Filter '*.md' -File | Sort-Object Name)
    if ($retries.Count -gt 0) { Write-Log "Retrying $($retries.Count) deferred capture(s)." }

    $fresh = @(Get-ChildItem -LiteralPath $InboxDir -Filter '*.md' -File |
        Where-Object { $_.Name -notlike '.*' -and $_.Name -notlike '*~syncthing~*' } |
        Sort-Object Name)

    $work = @()
    foreach ($f in $retries) { $work += [pscustomobject]@{ File = $f; InProcessing = $true } }
    foreach ($f in $fresh)   { $work += [pscustomobject]@{ File = $f; InProcessing = $false } }

    foreach ($job in $work) {
        $file = $job.File
        $stats.Seen++

        if (-not $job.InProcessing) {
            $age = (Get-Date) - $file.LastWriteTime
            if ($age.TotalSeconds -lt $SettleSeconds) {
                Write-Log "$($file.Name): written $([int]$age.TotalSeconds)s ago - leaving for next run."
                $stats.NotSettled++
                continue
            }
        }

        $working      = if ($job.InProcessing) { $file.FullName } else { $null }
        $attemptsPath = Join-Path $ProcessingDir ($file.Name + '.attempts')

        try {
            $raw = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
            if ([string]::IsNullOrWhiteSpace($raw)) {
                throw "File is empty or whitespace only ($($file.Length) bytes on disk)."
            }

            $parsed = Get-Frontmatter -Lines @($raw -split "`r?`n")
            $meta   = $parsed.Meta
            $body   = $parsed.Body
            if ([string]::IsNullOrWhiteSpace($body)) { throw 'Frontmatter present but body is empty.' }

            $baseName = [IO.Path]::GetFileNameWithoutExtension($file.Name)
            $id       = $baseName
            $stamp    = Get-CaptureStamp -BaseName $baseName
            if ($null -eq $stamp) {
                Write-Log "$($file.Name): no parseable timestamp in filename - using file mtime." 'WARN'
                $stamp = $file.LastWriteTime
            }
            $hash = Get-BodyHash -Text $body

            if ($state.Ids.Contains($id)) {
                Write-Log "$($file.Name): id already in ledger - archiving without reprocessing." 'WARN'
                if (-not $DryRun) {
                    Move-Item -LiteralPath $file.FullName -Destination (New-UniquePath $ArchiveDir $file.Name)
                }
                $stats.Skipped++
                continue
            }

            if ($state.Hashes.Contains($hash)) {
                Write-Log "$($file.Name): duplicate content - archiving, not filing."
                if (-not $DryRun) {
                    Move-Item -LiteralPath $file.FullName -Destination (New-UniquePath $ArchiveDir $file.Name)
                }
                Add-LedgerEntry -Entry @{
                    id = $id; source_file = $file.Name; body_hash = $hash
                    captured = $stamp.ToString('o'); status = 'duplicate'
                    item_count = 0; processed_at = (Get-Date).ToString('o')
                    processor_version = $ProcessorVersion
                }
                [void]$state.Ids.Add($id)
                $stats.Duplicate++
                continue
            }

            # Skip test captures before spending an API call.
            if ($body -match '^\s*test\b') {
                Write-Log "$($file.Name): test capture - archiving."
                if (-not $DryRun) {
                    Move-Item -LiteralPath $file.FullName -Destination (New-UniquePath $ArchiveDir $file.Name)
                }
                Add-LedgerEntry -Entry @{
                    id = $id; source_file = $file.Name; body_hash = $hash
                    captured = $stamp.ToString('o'); status = 'test'
                    item_count = 0; processed_at = (Get-Date).ToString('o')
                    processor_version = $ProcessorVersion
                }
                [void]$state.Ids.Add($id); [void]$state.Hashes.Add($hash)
                $stats.Skipped++
                continue
            }

            # Out of the synced vault before the slow part.
            if (-not $job.InProcessing) {
                $working = New-UniquePath -Directory $ProcessingDir -FileName $file.Name
                if ($DryRun) { Write-Log "DRYRUN move $($file.Name) -> processing\" }
                else { Move-Item -LiteralPath $file.FullName -Destination $working }
            }

            $sendBody  = $body
            $truncated = $false
            if ($sendBody.Length -gt $BodyLimit) {
                $sendBody  = $sendBody.Substring(0, $BodyLimit)
                $truncated = $true
            }

            $result = Invoke-Classifier -Body $sendBody -NoteId $id
            $items  = @($result.items)
            # classify-prompt.md rule 9: a valid capture always yields >=1
            # item. An empty array is model flakiness (the same class of
            # thing as a bad finishReason or MAX_TOKENS, both already
            # transient below), not a structurally bad capture like missing
            # frontmatter - retry it instead of failing permanently on the
            # first occurrence.
            if ($items.Count -eq 0) { throw [TransientApiError]::new('Classifier returned no items.') }

            $queued = 0; $enrichFailedCount = 0
            for ($i = 0; $i -lt $items.Count; $i++) {
                $item = $items[$i]
                $cat  = $item.category

                if ($cat -notin $AllCategories) {
                    Write-Log "  unknown category '$cat' - queuing as unclassified." 'WARN'
                    $item.category = 'unclassified'
                    $cat = 'unclassified'
                }

                $enrichment   = $null
                $enrichFailed = $false
                if ($cat -notin $TaskCategories) {
                    try {
                        $enrichment = Invoke-Enrichment -Item $item -NoteId $id
                    }
                    catch {
                        Write-Log "  enrichment failed for item $($i + 1) [$cat] - $($_.Exception.Message)" 'WARN'
                        $enrichFailed = $true
                        $enrichFailedCount++
                    }
                }

                [void](Write-QueueRow -Item $item -CaptureId $id -Stamp $stamp -Index ($i + 1) `
                        -OriginalBody $body -WasTruncated $truncated `
                        -Enrichment $enrichment -EnrichFailed $enrichFailed)
                $queued++
            }

            $archived = New-UniquePath -Directory $ArchiveDir -FileName $file.Name
            if ($DryRun) { Write-Log "DRYRUN move -> Archive\Captures\" }
            else {
                Move-Item -LiteralPath $working -Destination $archived
                Remove-Item -LiteralPath $attemptsPath -ErrorAction SilentlyContinue
            }
            $working = $null

            Add-LedgerEntry -Entry @{
                id                = $id
                source_file       = $file.Name
                body_hash         = $hash
                captured          = $stamp.ToString('o')
                body_chars        = $body.Length
                truncated         = $truncated
                item_count        = $items.Count
                queued            = $queued
                categories        = @($items | ForEach-Object { $_.category })
                status            = 'processed'
                processed_at      = (Get-Date).ToString('o')
                processor_version = $ProcessorVersion
                model             = $Model
            }

            [void]$state.Ids.Add($id); [void]$state.Hashes.Add($hash)
            $stats.Queued += $queued; $stats.EnrichFailed += $enrichFailedCount
            Write-Log "$($file.Name): $($items.Count) item(s) queued, $enrichFailedCount enrichment failure(s)"
        }
        catch [TransientApiError] {
            Resolve-TransientFailure -File $file -Working $working -AttemptsPath $attemptsPath -Stats $stats -ErrorRecord $_
        }
        catch {
            Resolve-PermanentFailure -File $file -Working $working -AttemptsPath $attemptsPath -Stats $stats -ErrorRecord $_
        }

        if ($DelaySeconds -gt 0) { Start-Sleep -Seconds $DelaySeconds }
    }

    Invoke-ReenrichRequests -Stats $stats

    Write-Log ("Done. seen={0} queued={1} enrich-failed={2} duplicate={3} skipped={4} deferred={5} failed={6} not-settled={7} reenriched={8} reenrich-failed={9}" -f `
        $stats.Seen, $stats.Queued, $stats.EnrichFailed, $stats.Duplicate, $stats.Skipped,
        $stats.Deferred, $stats.Failed, $stats.NotSettled, $stats.Reenriched, $stats.ReenrichFailed)
}
finally {
    if (-not $DryRun -and (Test-Path -LiteralPath $LockPath)) { Remove-Item -LiteralPath $LockPath -Force }
}
