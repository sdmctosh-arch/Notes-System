# Reading a raw capture, hashing/dedup state, and every write into the
# ledger or queue\pending\ - frontmatter parsing, the content-hash ledger,
# atomic queue writes, and the re-enrich request pipeline (which itself
# composes Invoke-Enrichment from Enrichment.ps1 with Set-QueueItemAtomic
# below - a cross-module call, resolved fine at runtime since every lib
# file is dot-sourced into the same script scope).

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
        # 10.6: temp file then rename - a reader (the backend, or another
        # processor run) must never see a half-written file. This is the far
        # more common write path (every classified item, not just a
        # re-enrich), so it needs the same guarantee Set-QueueItemAtomic
        # already gives the re-enrich path below.
        Set-QueueItemAtomic -Path $target -Item $row
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
                category   = $item.category
                title      = $item.title
                body       = $item.body
                url        = $item.url
                # Needed for Get-TmdbArt's game/music skip and movie-vs-tv
                # endpoint choice (9.2) - without it, a re-enriched media
                # item would silently never get a poster/backdrop, since
                # Get-ItemField would find nothing to read it from.
                media_type = $item.media_type
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
