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
$QueueDone     = Join-Path $SystemRoot 'queue\done'
$LogDir        = Join-Path $SystemRoot 'logs'
$LedgerPath    = Join-Path $SystemRoot 'ledger.jsonl'
$LockPath      = Join-Path $SystemRoot '.lock'
$LogPath       = Join-Path $LogDir ("processor-{0:yyyy-MM-dd}.log" -f (Get-Date))

# --- Helpers -----------------------------------------------------------------

function Write-Log {
    param(
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet('INFO','WARN','ERROR')][string]$Level = 'INFO'
    )
    $line = "{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}" -f (Get-Date), $Level, $Message
    Write-Host $line
    if (-not $DryRun) { Add-Content -LiteralPath $LogPath -Value $line -Encoding utf8 }
}

function Get-Frontmatter {
    param([Parameter(Mandatory)][AllowEmptyCollection()][AllowEmptyString()][string[]]$Lines)

    if ($Lines.Count -lt 3 -or $Lines[0].Trim() -ne '---') {
        throw 'No frontmatter block found (line 1 is not ---).'
    }
    $closeIndex = -1
    for ($i = 1; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i].Trim() -eq '---') { $closeIndex = $i; break }
    }
    if ($closeIndex -lt 0) { throw 'Frontmatter block is not closed.' }

    $meta = @{}
    for ($i = 1; $i -lt $closeIndex; $i++) {
        $raw = $Lines[$i]
        if ([string]::IsNullOrWhiteSpace($raw)) { continue }
        $split = $raw.IndexOf(':')
        if ($split -lt 1) { continue }
        $meta[$raw.Substring(0, $split).Trim()] = $raw.Substring($split + 1).Trim().Trim('"',"'")
    }

    $body = if ($closeIndex -ge $Lines.Count - 1) {
        ''
    } else {
        ($Lines[($closeIndex + 1)..($Lines.Count - 1)] -join "`n").Trim()
    }
    return @{ Meta = $meta; Body = $body }
}

function Get-CaptureStamp {
    param([Parameter(Mandatory)][string]$BaseName)

    $m = [regex]::Match($BaseName, '^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})')
    if (-not $m.Success) { return $null }
    try {
        $dt = [datetime]::new(
            [int]$m.Groups[1].Value, [int]$m.Groups[2].Value, [int]$m.Groups[3].Value,
            [int]$m.Groups[4].Value, [int]$m.Groups[5].Value, [int]$m.Groups[6].Value)
        return [datetime]::SpecifyKind($dt, [DateTimeKind]::Local)
    }
    catch { return $null }
}

function Get-BodyHash {
    param([Parameter(Mandatory)][string]$Text)

    # Normalise whitespace so a trivial reformat is still recognised as the
    # same capture. The duplicate leek recipe differed only in filename.
    $norm  = ($Text -replace '\s+', ' ').Trim().ToLowerInvariant()
    $bytes = [Text.Encoding]::UTF8.GetBytes($norm)
    $sha   = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','') }
    finally { $sha.Dispose() }
}

function New-UniquePath {
    param(
        [Parameter(Mandatory)][string]$Directory,
        [Parameter(Mandatory)][string]$FileName
    )
    $candidate = Join-Path $Directory $FileName
    if (-not (Test-Path -LiteralPath $candidate)) { return $candidate }

    $base = [IO.Path]::GetFileNameWithoutExtension($FileName)
    $ext  = [IO.Path]::GetExtension($FileName)
    $n    = 1
    while ($true) {
        $candidate = Join-Path $Directory ("{0}-{1}{2}" -f $base, $n, $ext)
        if (-not (Test-Path -LiteralPath $candidate)) { return $candidate }
        $n++
    }
}

function Test-CleanUrl {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    if ($Value -match '\s') { return $false }
    $u = $null
    if (-not [uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$u)) { return $false }
    return $u.Scheme -in @('http','https')
}

function Get-ItemField {
    param(
        [Parameter(Mandatory)]$Item,
        [Parameter(Mandatory)][string]$Name
    )
    if ($Item.PSObject.Properties.Name -contains $Name) {
        $v = $Item.$Name
        if (-not [string]::IsNullOrWhiteSpace([string]$v)) { return [string]$v }
    }
    return $null
}

function Get-ProcessedState {
    <# Returns ids and body hashes already handled. #>
    param([Parameter(Mandatory)][string]$Path)

    $state = @{
        Ids    = [Collections.Generic.HashSet[string]]::new()
        Hashes = [Collections.Generic.HashSet[string]]::new()
    }
    if (-not (Test-Path -LiteralPath $Path)) { return $state }

    foreach ($line in [IO.File]::ReadLines($Path)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        try {
            $entry = $line | ConvertFrom-Json
            $names = $entry.PSObject.Properties.Name
            if ($names -contains 'id' -and $entry.id) { [void]$state.Ids.Add($entry.id) }
            if ($names -contains 'body_hash' -and $entry.body_hash) { [void]$state.Hashes.Add($entry.body_hash) }
        }
        catch { Write-Log 'Ledger line is not valid JSON - ignoring.' 'WARN' }
    }
    return $state
}

function Add-LedgerEntry {
    param([Parameter(Mandatory)][hashtable]$Entry)

    $json = $Entry | ConvertTo-Json -Compress -Depth 8
    if ($DryRun) { Write-Log "DRYRUN ledger += $json"; return }
    Add-Content -LiteralPath $LedgerPath -Value $json -Encoding utf8
}

# --- Classification ----------------------------------------------------------

$ResponseSchema = @{
    type       = 'object'
    properties = @{
        items = @{
            type  = 'array'
            items = @{
                type       = 'object'
                properties = [ordered]@{
                    category = @{
                        type = 'string'
                        enum = @('lookup','todo','project','recipe','idea',
                                 'media','reference','grocery','unclassified')
                    }
                    title                = @{ type = 'string' }
                    body                 = @{ type = 'string' }
                    url                  = @{ type = 'string' }
                    media_type           = @{ type = 'string'; enum = @('tv','movie','game','music','other') }
                    timing               = @{ type = 'string' }
                    automation_candidate = @{ type = 'string' }
                    ambiguity_note       = @{ type = 'string' }
                }
                required = @('category','title','body')
            }
        }
    }
    required = @('items')
}

$EnrichmentResponseSchema = @{
    type       = 'object'
    properties = [ordered]@{
        kind      = @{ type = 'string'; enum = @('answer','page_summary','media_info','recipe','guide') }
        summary   = @{ type = 'string' }
        detail    = @{ type = 'string' }
        citations = @{
            type  = 'array'
            items = @{
                type       = 'object'
                properties = [ordered]@{
                    title = @{ type = 'string' }
                    url   = @{ type = 'string' }
                }
                required = @('title','url')
            }
        }
        # Separate, narrowly-scoped fields per kind rather than one shared
        # object - an irrelevant property left in reach of the model (a
        # recipe response holding a "year" field, say) has been observed
        # inviting run-on, self-narrating filler instead of staying empty.
        # Kept apart, there's nothing irrelevant to fill.
        recipe = @{
            type       = 'object'
            properties = [ordered]@{
                name               = @{ type = 'string' }
                recipeIngredient   = @{ type = 'array'; items = @{ type = 'string' } }
                recipeInstructions = @{ type = 'array'; items = @{ type = 'string' } }
                description        = @{ type = 'string' }
                recipeYield        = @{ type = 'string' }
                prepTime           = @{ type = 'string' }
                cookTime           = @{ type = 'string' }
                totalTime          = @{ type = 'string' }
                recipeCategory     = @{ type = 'string' }
                recipeCuisine      = @{ type = 'string' }
            }
            # Without this, the model has been observed including the
            # object but skipping the two fields that are the entire point
            # of a recipe conversion, while still filling in optional
            # metadata like yield and cuisine.
            required = @('name','recipeIngredient','recipeInstructions')
        }
        media = @{
            type       = 'object'
            properties = [ordered]@{
                title      = @{ type = 'string' }
                year       = @{ type = 'string' }
                media_type = @{ type = 'string' }
            }
        }
    }
    required = @('kind','summary','detail','citations')
}

class TransientApiError : Exception {
    TransientApiError([string]$m) : base($m) {}
}

class EnrichmentApiError : Exception {
    EnrichmentApiError([string]$m) : base($m) {}
}

function Invoke-Classifier {
    param(
        [Parameter(Mandatory)][string]$Body,
        [Parameter(Mandatory)][string]$NoteId
    )

    $genConfig = [ordered]@{
        temperature      = 0
        maxOutputTokens  = 4000
        responseMimeType = 'application/json'
        responseSchema   = $ResponseSchema
    }
    if ($ThinkingBudget -ge 0) { $genConfig['thinkingConfig'] = @{ thinkingBudget = $ThinkingBudget } }

    $payload = [ordered]@{
        systemInstruction = @{ parts = @(@{ text = $script:SystemPrompt }) }
        contents          = @(@{ role = 'user'; parts = @(@{ text = "Capture id: $NoteId`n`n---`n$Body`n---" }) })
        generationConfig  = $genConfig
    } | ConvertTo-Json -Depth 20

    $uri = "https://generativelanguage.googleapis.com/v1beta/models/{0}:generateContent" -f $Model

    $attempt = 0
    $resp = $null
    while ($true) {
        try {
            $resp = Invoke-RestMethod -Uri $uri -Method Post `
                -Headers @{ 'x-goog-api-key' = $script:ApiKey; 'content-type' = 'application/json' } `
                -Body $payload
            break
        }
        catch {
            $code = $null
            if ($_.Exception.PSObject.Properties.Name -contains 'Response' -and $_.Exception.Response) {
                $code = [int]$_.Exception.Response.StatusCode
            }
            $attempt++
            if (($null -eq $code -or $code -eq 429 -or $code -ge 500) -and $attempt -le 3) {
                $wait = [math]::Min(45, [math]::Pow(2, $attempt) * 3) + (Get-Random -Minimum 0 -Maximum 3)
                Write-Log "  HTTP $code - waiting $([int]$wait)s (attempt $attempt/3)" 'WARN'
                Start-Sleep -Seconds $wait
                continue
            }
            if ($null -eq $code -or $code -eq 429 -or $code -ge 500) {
                throw [TransientApiError]::new("HTTP $code after $attempt attempts")
            }
            throw
        }
    }

    $candidate = $resp.candidates | Select-Object -First 1
    if ($null -eq $candidate) { throw [TransientApiError]::new('No candidate returned') }

    $finish = if ($candidate.PSObject.Properties.Name -contains 'finishReason') { $candidate.finishReason } else { 'UNKNOWN' }
    if ($finish -notin @('STOP','UNKNOWN')) {
        # MAX_TOKENS and safety blocks are worth retrying once conditions change.
        throw [TransientApiError]::new("finishReason=$finish")
    }

    $text = ($candidate.content.parts | ForEach-Object { $_.text }) -join ''
    return ($text.Trim() | ConvertFrom-Json)
}

# --- Enrichment ----------------------------------------------------------------

function Get-EmbedFromUrl {
    param([AllowNull()][string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) { return $null }
    $m = [regex]::Match($Url, '(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([\w-]{11})')
    if (-not $m.Success) { return $null }
    return @{ type = 'youtube'; video_id = $m.Groups[1].Value }
}

function Invoke-Enrichment {
    param(
        [Parameter(Mandatory)]$Item,
        [Parameter(Mandatory)][string]$NoteId
    )

    $url = Get-ItemField $Item 'url'
    $lines = @(
        "Category: $($Item.category)"
        "Title: $(Get-ItemField $Item 'title')"
        "Body: $(Get-ItemField $Item 'body')"
    )
    if ($url -and (Test-CleanUrl $url)) { $lines += "URL: $url" }

    $payload = [ordered]@{
        model              = $EnrichModel
        input              = ($lines -join "`n")
        system_instruction = $script:EnrichSystemPrompt
        tools              = @(@{ type = 'google_search' }, @{ type = 'url_context' })
        store              = $false
        # On Gemini 3 models this budget is shared between thinking and
        # output tokens. Left unset, a long conversion (a full recipe) can
        # exhaust it on thinking alone and come back status=incomplete with
        # no usable text. Confirmed against the live API: a dense, long
        # recipe occasionally runs past 22k output tokens even with the
        # required-field and detail-brevity fixes in place - 32000 leaves
        # real headroom. A run that still hits the cap comes back
        # enrich_failed rather than corrupt data; the capture itself is
        # never lost.
        generation_config  = @{ max_output_tokens = 32000 }
        response_format    = [ordered]@{
            type      = 'text'
            mime_type = 'application/json'
            schema    = $EnrichmentResponseSchema
        }
    } | ConvertTo-Json -Depth 20

    # Overridable so a re-enrich request can be exercised against a local
    # stub in a sandbox that can't reach the real API (mirrors the
    # interface's own GEMINI_INTERACTIONS_URL override in gemini_chat.py) -
    # the default is the real endpoint.
    $uri = if ($env:GEMINI_INTERACTIONS_URL) { $env:GEMINI_INTERACTIONS_URL } else { 'https://generativelanguage.googleapis.com/v1beta/interactions' }

    $attempt = 0
    $resp = $null
    while ($true) {
        try {
            $resp = Invoke-RestMethod -Uri $uri -Method Post `
                -Headers @{
                    'x-goog-api-key' = $script:ApiKey
                    'content-type'   = 'application/json'
                    'Api-Revision'   = $InteractionsApiRevision
                } `
                -Body $payload
            break
        }
        catch {
            $code = $null
            if ($_.Exception.PSObject.Properties.Name -contains 'Response' -and $_.Exception.Response) {
                $code = [int]$_.Exception.Response.StatusCode
            }
            $attempt++
            if (($null -eq $code -or $code -eq 429 -or $code -ge 500) -and $attempt -le 3) {
                $wait = [math]::Min(45, [math]::Pow(2, $attempt) * 3) + (Get-Random -Minimum 0 -Maximum 3)
                Write-Log "  enrichment HTTP $code - waiting $([int]$wait)s (attempt $attempt/3)" 'WARN'
                Start-Sleep -Seconds $wait
                continue
            }
            throw [EnrichmentApiError]::new("HTTP $code : $($_.Exception.Message)")
        }
    }

    if ($resp.PSObject.Properties.Name -contains 'status' -and $resp.status -and $resp.status -ne 'completed') {
        throw [EnrichmentApiError]::new("interaction status=$($resp.status)")
    }

    $modelStep = $resp.steps | Where-Object { $_.type -eq 'model_output' } | Select-Object -Last 1
    if ($null -eq $modelStep) { throw [EnrichmentApiError]::new('No model_output step returned') }

    $textPart = $modelStep.content | Where-Object { $_.type -eq 'text' } | Select-Object -First 1
    if ($null -eq $textPart -or [string]::IsNullOrWhiteSpace($textPart.text)) {
        throw [EnrichmentApiError]::new('model_output step has no text content')
    }

    $parsed = $textPart.text.Trim() | ConvertFrom-Json

    # Guard that doesn't depend on model behaviour: structured only comes
    # from the field matching the declared kind. Whatever landed in the
    # other field - the model does not reliably leave it empty - is
    # discarded rather than stored.
    $structured = $null
    if ($parsed.kind -eq 'recipe' -and $parsed.PSObject.Properties.Name -contains 'recipe') {
        $structured = $parsed.recipe
    }
    elseif ($parsed.kind -eq 'media_info' -and $parsed.PSObject.Properties.Name -contains 'media') {
        $structured = $parsed.media
    }

    return [ordered]@{
        kind        = $parsed.kind
        summary     = $parsed.summary
        detail      = $parsed.detail
        citations   = @($parsed.citations)
        embed       = Get-EmbedFromUrl -Url $url
        structured  = $structured
        model       = $EnrichModel
        enriched_at = (Get-Date).ToString('o')
    }
}

# --- Routing -----------------------------------------------------------------

function Write-QueueRow {
    param(
        [Parameter(Mandatory)]$Item,
        [Parameter(Mandatory)][string]$CaptureId,
        [Parameter(Mandatory)][datetime]$Stamp,
        [Parameter(Mandatory)][int]$Index,
        [Parameter(Mandatory)][AllowEmptyString()][string]$OriginalBody,
        [Parameter(Mandatory)][bool]$WasTruncated,
        $Enrichment,
        [bool]$EnrichFailed
    )

    $category = $Item.category
    $url      = Get-ItemField $Item 'url'
    $proposed = Get-ItemField $Item 'automation_candidate'

    # The guard. Recorded either way so the misfire rate stays visible; only
    # promoted to an actionable field if BOTH the category and the slug are
    # explicitly allowed, and $AllowedAutomations is empty until phase 4.
    $approvedAutomation = $null
    if ($proposed -and
        $category -in $AutomationAllowedCategories -and
        $proposed -in $AllowedAutomations) {
        $approvedAutomation = $proposed
    }
    elseif ($proposed) {
        Write-Log "  automation '$proposed' proposed on [$category] - recorded, not actionable" 'WARN'
    }

    # A truncated capture means the model only saw the first $BodyLimit chars.
    # Queuing its body would silently discard most of a long item (a recipe,
    # most often).
    $body = if ($WasTruncated) { $OriginalBody } else { (Get-ItemField $Item 'body') ?? $OriginalBody }

    $status = if ($EnrichFailed) { 'enrich_failed' } elseif ($Enrichment) { 'enriched' } else { 'pending' }

    $row = [ordered]@{
        queue_id            = "{0}-{1:d2}" -f $CaptureId, $Index
        capture_id          = $CaptureId
        category            = $category
        title               = Get-ItemField $Item 'title'
        body                = $body
        url                 = if ($url -and (Test-CleanUrl $url)) { $url } else { $null }
        url_rejected        = if ($url -and -not (Test-CleanUrl $url)) { $url } else { $null }
        media_type          = Get-ItemField $Item 'media_type'
        timing              = Get-ItemField $Item 'timing'
        proposed_automation = $proposed
        approved_automation = $approvedAutomation
        ambiguity_note      = Get-ItemField $Item 'ambiguity_note'
        captured            = $Stamp.ToString('o')
        created             = (Get-Date).ToString('o')
        status              = $status
        enrichment          = $Enrichment
        processor_version   = $ProcessorVersion
    }

    $target = Join-Path $QueuePending ("{0}.json" -f $row.queue_id)
    if ($DryRun) {
        Write-Log "  DRYRUN queue -> pending\$($row.queue_id).json [$category] $($row.title) status=$status"
    } else {
        Set-Content -LiteralPath $target -Value ($row | ConvertTo-Json -Depth 10) -Encoding utf8
    }
    return $target
}

# --- Re-enrichment requests ---------------------------------------------------
#
# PROJECT.md 10.5: the interface must not call the Gemini API for this - it
# only writes a <queue_id>.reenrich marker file into queue\pending\ (a
# documented exception to 10.6's "the processor creates files in
# queue\pending\ only", alongside chat's Gemini-call exception in 3.3). This
# is the processor side: pick up each marker, redo pass 2 on the matching
# item, and remove the marker either way so a bad request doesn't loop.

function Set-QueueItemAtomic {
    <# 10.6: write to a temp file, then replace - never edit the JSON a
       reader might be mid-read on in place. #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)]$Item
    )
    $json = $Item | ConvertTo-Json -Depth 10
    $tmp  = Join-Path (Split-Path $Path -Parent) (".tmp-{0}.json" -f [guid]::NewGuid().ToString('N'))
    Set-Content -LiteralPath $tmp -Value $json -Encoding utf8
    # Move-Item -Force, not [IO.File]::Replace($tmp, $Path, $null) - on this
    # platform/.NET, Replace's 3-arg overload throws "The value cannot be an
    # empty string (Parameter 'path')" when the backup path is $null, even
    # though $null is meant to mean "no backup". Move-Item -Force overwrites
    # an existing target fine (CLAUDE.md's Move-Item note is about the
    # *default*, non-Force behavior - deliberately overwriting an existing
    # file, as here, is exactly what -Force is for) and stays a same-
    # directory rename, so it's still atomic.
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function Invoke-ReenrichRequests {
    param([Parameter(Mandatory)][hashtable]$Stats)

    $markers = @(Get-ChildItem -LiteralPath $QueuePending -Filter '*.reenrich' -File -ErrorAction SilentlyContinue |
        Sort-Object Name)
    if ($markers.Count -eq 0) { return }
    Write-Log "Found $($markers.Count) re-enrich request(s)."

    foreach ($marker in $markers) {
        $queueId  = [IO.Path]::GetFileNameWithoutExtension($marker.Name)
        $itemPath = Join-Path $QueuePending "$queueId.json"
        try {
            if (-not (Test-Path -LiteralPath $itemPath)) {
                Write-Log "  $queueId - no matching pending item (already moved on?) - dropping the request." 'WARN'
                continue
            }

            $item = Get-Content -LiteralPath $itemPath -Raw -Encoding utf8 | ConvertFrom-Json
            if ($item.category -in $TaskCategories) {
                Write-Log "  $queueId - [$($item.category)] is never enriched - dropping the request." 'WARN'
                continue
            }

            if ($DryRun) {
                Write-Log "  DRYRUN re-enrich $queueId [$($item.category)]"
                continue
            }

            $synthetic = [pscustomobject]@{
                category = $item.category
                title    = $item.title
                body     = $item.body
                url      = $item.url
            }
            try {
                $enrichment = Invoke-Enrichment -Item $synthetic -NoteId $item.capture_id
            }
            catch {
                # Leave the item exactly as it was - a failed retry must not
                # discard a working enrichment the item already had, and if
                # it was already enrich_failed this just leaves it that way.
                Write-Log "  $queueId - re-enrichment failed, item left unchanged - $($_.Exception.Message)" 'WARN'
                $Stats.ReenrichFailed++
                continue
            }

            $item.enrichment = $enrichment
            $item.status     = 'enriched'
            Set-QueueItemAtomic -Path $itemPath -Item $item
            $Stats.Reenriched++
            Write-Log "  $queueId - re-enriched."
        }
        catch {
            Write-Log "  $queueId - could not process re-enrich request - $($_.Exception.Message)" 'ERROR'
        }
        finally {
            if (-not $DryRun) { Remove-Item -LiteralPath $marker.FullName -Force -ErrorAction SilentlyContinue }
        }
    }
}

# --- Setup -------------------------------------------------------------------

foreach ($dir in @($InboxDir, $ArchiveDir, $ProcessingDir, $FailedDir,
                   $QueuePending, $QueueDone, $LogDir)) {
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
    $script:ApiKey = [Net.NetworkCredential]::new('', (Import-Clixml -LiteralPath $KeyPath)).Password
}
else {
    throw "No API key available. Set `$env:GEMINI_API_KEY or provide -KeyPath $KeyPath."
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
            if ($items.Count -eq 0) { throw 'Classifier returned no items.' }

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
            # Leave it in processing\ and try again next run.
            $n = 0
            if (Test-Path -LiteralPath $attemptsPath) { $n = [int](Get-Content -LiteralPath $attemptsPath -Raw) }
            $n++

            if ($n -ge $MaxAttempts) {
                Write-Log "$($file.Name): transient failure $n/$MaxAttempts - giving up. $($_.Exception.Message)" 'ERROR'
                if (-not $DryRun) {
                    $failTarget = New-UniquePath -Directory $FailedDir -FileName $file.Name
                    Move-Item -LiteralPath $working -Destination $failTarget
                    Set-Content -LiteralPath "$failTarget.reason.txt" -Value $_.Exception.Message -Encoding utf8
                    Remove-Item -LiteralPath $attemptsPath -ErrorAction SilentlyContinue
                }
                $stats.Failed++
            } else {
                Write-Log "$($file.Name): transient failure $n/$MaxAttempts - deferring. $($_.Exception.Message)" 'WARN'
                if (-not $DryRun) { Set-Content -LiteralPath $attemptsPath -Value $n -Encoding utf8 }
                $stats.Deferred++
            }
        }
        catch {
            $reason = $_.Exception.Message
            Write-Log "$($file.Name): FAILED - $reason" 'ERROR'
            try {
                $origin = if ($working -and (Test-Path -LiteralPath $working)) { $working } else { $file.FullName }
                if (-not $DryRun -and (Test-Path -LiteralPath $origin)) {
                    $failTarget = New-UniquePath -Directory $FailedDir -FileName $file.Name
                    Move-Item -LiteralPath $origin -Destination $failTarget
                    Set-Content -LiteralPath "$failTarget.reason.txt" -Value $reason -Encoding utf8
                    Remove-Item -LiteralPath $attemptsPath -ErrorAction SilentlyContinue
                }
            }
            catch { Write-Log "$($file.Name): could not move to failed\ - $($_.Exception.Message)" 'ERROR' }
            $stats.Failed++
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
