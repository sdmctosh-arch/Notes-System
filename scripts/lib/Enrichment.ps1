# Pass 2: enrich a classified item (answer/summarize/convert/research),
# plus the two best-effort art lookups (TMDB, SteamGridDB) enrichment pulls
# in for a media_info item. EnrichmentApiError signals a failure the main
# loop treats as non-retryable within this run - see the per-item try/catch
# around Invoke-Enrichment in Invoke-NoteProcessor-v2.ps1's main loop, which
# logs it and queues the item as enrich_failed rather than deferring the
# whole capture.

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
                image              = @{ type = 'string' }
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

class EnrichmentApiError : Exception {
    EnrichmentApiError([string]$m) : base($m) {}
}

function Get-EmbedFromUrl {
    param([AllowNull()][string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) { return $null }
    $m = [regex]::Match($Url, '(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([\w-]{11})')
    if (-not $m.Success) { return $null }
    return @{ type = 'youtube'; video_id = $m.Groups[1].Value }
}

function Get-TmdbArt {
    <# Best-effort poster/backdrop lookup for a media_info item, direct
       against TMDB - not via Gemini's own search tool, unlike a recipe's
       image (see enrich-prompt.md), because TMDB gives a real, addressable
       image URL for a specific title/year in one call instead of leaving
       the model to guess at one. Mirrors the search-then-filter-by-year
       matching backend/app/seerr.py already does against Seerr's TMDB-
       backed search, reimplemented here since this call happens processor-
       side, at enrichment time, not from the interface. Never throws - a
       missing key, an unmatched title, or an API error all just mean no
       image, exactly like a Seerr/Tandoor push failing does not block
       filing the note. #>
    param(
        [AllowNull()][string]$Title,
        [AllowNull()][string]$MediaType,
        [AllowNull()][string]$Year
    )

    if (-not $script:TmdbApiKey) { return $null }
    if ([string]::IsNullOrWhiteSpace($Title)) { return $null }
    # Matches item.media_type, the classifier's schema-enforced field (9.2) -
    # game/music have no TMDB equivalent, same skip Seerr's push makes.
    if ($MediaType -notin @('movie','tv')) { return $null }
    if ([string]::IsNullOrWhiteSpace($Year) -or $Year.Length -lt 4) { return $null }

    $dateField = if ($MediaType -eq 'movie') { 'release_date' } else { 'first_air_date' }
    $endpoint  = "https://api.themoviedb.org/3/search/$MediaType"
    # Explicit encoding, not -Body's form-encoded query string (which uses
    # '+' for spaces) - the same class of thing that broke Seerr's stricter
    # query validator (backend/app/seerr.py). TMDB tolerates '+' in
    # practice, but there's no reason to rely on that when
    # Get-SteamGridDbArt right below already does this the explicit way.
    $encodedKey   = [uri]::EscapeDataString($script:TmdbApiKey)
    $encodedTitle = [uri]::EscapeDataString($Title)

    try {
        $resp = Invoke-RestMethod -Uri "$endpoint`?api_key=$encodedKey&query=$encodedTitle" -Method Get
    }
    catch {
        Write-Log "  TMDB search failed for '$Title' - $($_.Exception.Message)" 'WARN'
        return $null
    }

    $yearPrefix = $Year.Substring(0, 4)
    $match = $resp.results |
        Where-Object { $_.$dateField -and $_.$dateField.Length -ge 4 -and $_.$dateField.Substring(0, 4) -eq $yearPrefix } |
        Select-Object -First 1
    if (-not $match) { return $null }

    $base = 'https://image.tmdb.org/t/p'
    return @{
        image    = if ($match.poster_path)   { "$base/w500$($match.poster_path)" }   else { $null }
        backdrop = if ($match.backdrop_path) { "$base/w1280$($match.backdrop_path)" } else { $null }
    }
}

function Get-SteamGridDbArt {
    <# Best-effort cover/hero lookup for a `game` media_info item, direct
       against SteamGridDB - the `game` counterpart to Get-TmdbArt above
       (TMDB has no game catalog, so game/music were previously always
       skipped there - see 9.2). No year-match guard here, unlike
       Get-TmdbArt: SteamGridDB's autocomplete search doesn't return a
       release date, and fetching one would mean an extra per-candidate
       API call for a personal capture list where same-title,
       different-year collisions are rare. Trusts the top (most relevant)
       autocomplete result instead - the same "good enough, not exact"
       bar already accepted for a recipe's photo (enrich-prompt.md).
       Never throws - a missing key, no match, or an API error all just
       mean no image. #>
    param(
        [AllowNull()][string]$Title,
        [AllowNull()][string]$MediaType
    )

    if (-not $script:SteamGridDbApiKey) { return $null }
    if ([string]::IsNullOrWhiteSpace($Title)) { return $null }
    if ($MediaType -ne 'game') { return $null }

    $headers = @{ Authorization = "Bearer $script:SteamGridDbApiKey" }
    $encodedTitle = [uri]::EscapeDataString($Title)

    try {
        $search = Invoke-RestMethod -Uri "https://www.steamgriddb.com/api/v2/search/autocomplete/$encodedTitle" -Method Get -Headers $headers
    }
    catch {
        Write-Log "  SteamGridDB search failed for '$Title' - $($_.Exception.Message)" 'WARN'
        return $null
    }
    if (-not $search.success -or -not $search.data -or @($search.data).Count -eq 0) { return $null }
    $gameId = $search.data[0].id

    # Grids (tall cover art, our "poster" equivalent) and heroes (wide
    # banner, our "backdrop" equivalent) are separate endpoints - a failure
    # on one shouldn't drop the other.
    $image = $null
    try {
        $grids = Invoke-RestMethod -Uri "https://www.steamgriddb.com/api/v2/grids/game/$gameId`?dimensions=600x900&types=static" -Method Get -Headers $headers
        if ($grids.success -and $grids.data -and @($grids.data).Count -gt 0) { $image = $grids.data[0].url }
    }
    catch {
        Write-Log "  SteamGridDB grid lookup failed for '$Title' (id=$gameId) - $($_.Exception.Message)" 'WARN'
    }

    $backdrop = $null
    try {
        $heroes = Invoke-RestMethod -Uri "https://www.steamgriddb.com/api/v2/heroes/game/$gameId`?types=static" -Method Get -Headers $headers
        if ($heroes.success -and $heroes.data -and @($heroes.data).Count -gt 0) { $backdrop = $heroes.data[0].url }
    }
    catch {
        Write-Log "  SteamGridDB hero lookup failed for '$Title' (id=$gameId) - $($_.Exception.Message)" 'WARN'
    }

    # Defensive validation (9.4's URL-validation rule) - unlike Get-TmdbArt's
    # URLs, which this script constructs itself from a path fragment,
    # these come straight from SteamGridDB's own `url` field.
    if ($image -and -not (Test-CleanUrl $image)) { $image = $null }
    if ($backdrop -and -not (Test-CleanUrl $backdrop)) { $backdrop = $null }
    if (-not $image -and -not $backdrop) { return $null }

    return @{ image = $image; backdrop = $backdrop }
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

    # generateContent, not the Interactions API. The Interactions endpoint
    # (/v1beta/interactions) was sunset in June 2026: it now rejects every
    # call with a 400 that misreports itself as a safety block, or drops the
    # connection. generateContent accepts the same google_search + url_context
    # grounding tools alongside a forced JSON responseSchema - the one
    # combination enrichment needs - verified against the live API.
    $payload = [ordered]@{
        systemInstruction = @{ parts = @(@{ text = $script:EnrichSystemPrompt }) }
        contents          = @(@{ role = 'user'; parts = @(@{ text = ($lines -join "`n") }) })
        tools             = @(@{ google_search = @{} }, @{ url_context = @{} })
        # The input is the user's own capture and a page they chose to save.
        # The default safety filters fire on ordinary reference links (a
        # hardware blog post has come back finishReason=SAFETY), so turn the
        # four configurable categories off. This does not touch the
        # non-configurable grounding/recitation checks, which can still stop
        # a response - that surfaces as finishReason=SAFETY/RECITATION below
        # and the item files enrich_failed, same as any other enrichment miss.
        safetySettings    = @(
            @{ category = 'HARM_CATEGORY_HARASSMENT';        threshold = 'BLOCK_NONE' }
            @{ category = 'HARM_CATEGORY_HATE_SPEECH';        threshold = 'BLOCK_NONE' }
            @{ category = 'HARM_CATEGORY_SEXUALLY_EXPLICIT';  threshold = 'BLOCK_NONE' }
            @{ category = 'HARM_CATEGORY_DANGEROUS_CONTENT';  threshold = 'BLOCK_NONE' }
        )
        generationConfig  = [ordered]@{
            # This budget is shared between thinking and output tokens on
            # Gemini 3 models. Left lower, a long conversion (a full recipe)
            # can exhaust it on thinking alone and come back with a non-STOP
            # finishReason and no usable text. Confirmed against the live
            # API: a dense, long recipe occasionally runs past 22k output
            # tokens even with the required-field and detail-brevity fixes
            # in place - 32000 leaves real headroom. A run that still hits
            # the cap comes back enrich_failed rather than corrupt data; the
            # capture itself is never lost.
            maxOutputTokens  = 32000
            responseMimeType = 'application/json'
            responseSchema   = $EnrichmentResponseSchema
        }
    } | ConvertTo-Json -Depth 20

    # Overridable so a re-enrich request can be exercised against a local
    # stub in a sandbox that can't reach the real API - the default is the
    # real endpoint.
    $uri = if ($env:GEMINI_ENRICH_URL) {
        $env:GEMINI_ENRICH_URL
    } else {
        "https://generativelanguage.googleapis.com/v1beta/models/{0}:generateContent" -f $EnrichModel
    }

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
                Write-Log "  enrichment HTTP $code - waiting $([int]$wait)s (attempt $attempt/3)" 'WARN'
                Start-Sleep -Seconds $wait
                continue
            }
            throw [EnrichmentApiError]::new("HTTP $code : $($_.Exception.Message)")
        }
    }

    $candidate = $resp.candidates | Select-Object -First 1
    if ($null -eq $candidate) { throw [EnrichmentApiError]::new('No candidate returned') }

    # google_search grounding can trip a SAFETY or RECITATION finishReason on
    # an otherwise fine item; MAX_TOKENS means the budget above was still too
    # low. Each of them means no usable JSON - fail the item (which queues it
    # enrich_failed) rather than parse a partial response.
    $finish = if ($candidate.PSObject.Properties.Name -contains 'finishReason') { $candidate.finishReason } else { 'UNKNOWN' }
    if ($finish -notin @('STOP','UNKNOWN')) {
        throw [EnrichmentApiError]::new("finishReason=$finish")
    }

    $text = ($candidate.content.parts | ForEach-Object { $_.text }) -join ''
    if ([string]::IsNullOrWhiteSpace($text)) {
        throw [EnrichmentApiError]::new('response has no text content')
    }

    $parsed = $text.Trim() | ConvertFrom-Json

    # Guard that doesn't depend on model behaviour: structured only comes
    # from the field matching the declared kind. Whatever landed in the
    # other field - the model does not reliably leave it empty - is
    # discarded rather than stored.
    $structured = $null
    if ($parsed.kind -eq 'recipe' -and $parsed.PSObject.Properties.Name -contains 'recipe') {
        $structured = $parsed.recipe
        # Same URL-validation rule as the top-level url field (9.4) - the
        # model finding an image is a nicety, not user data, so an invalid
        # value is just dropped to null rather than kept in a *_rejected
        # field the way url_rejected keeps the top-level one.
        $rawImage = Get-ItemField $structured 'image'
        $structured | Add-Member -NotePropertyName 'image' -NotePropertyValue `
            $(if ($rawImage -and (Test-CleanUrl $rawImage)) { $rawImage } else { $null }) -Force
    }
    elseif ($parsed.kind -eq 'media_info' -and $parsed.PSObject.Properties.Name -contains 'media') {
        $structured = $parsed.media
        # Not from Gemini's own search (unlike a recipe's image) - a direct,
        # best-effort lookup using the title/year enrichment already
        # confirmed and the classifier's schema-enforced media_type (9.2):
        # TMDB for movie/tv, SteamGridDB for game, nothing for music/other.
        $classifierMediaType = Get-ItemField $Item 'media_type'
        $art = if ($classifierMediaType -eq 'game') {
            Get-SteamGridDbArt -Title $structured.title -MediaType $classifierMediaType
        } else {
            Get-TmdbArt -Title $structured.title -MediaType $classifierMediaType -Year $structured.year
        }
        $structured | Add-Member -NotePropertyName 'image'    -NotePropertyValue $(if ($art) { $art.image }    else { $null }) -Force
        $structured | Add-Member -NotePropertyName 'backdrop' -NotePropertyValue $(if ($art) { $art.backdrop } else { $null }) -Force
    }

    return [ordered]@{
        kind        = $parsed.kind
        summary     = $parsed.summary
        detail      = $parsed.detail
        citations   = @($parsed.citations)
        # Same cleaned value that becomes the row's url/url_rejected (9.4) -
        # not the raw $url, which can carry model commentary (9.1's known
        # defect table). Otherwise an item whose url_rejected fires can still
        # end up with a working embed extracted from the rejected text.
        embed       = if ($url -and (Test-CleanUrl $url)) { Get-EmbedFromUrl -Url $url } else { $null }
        structured  = $structured
        model       = $EnrichModel
        enriched_at = (Get-Date).ToString('o')
    }
}
