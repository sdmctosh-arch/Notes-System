# Pass 1: classify a capture body into one or more categorized items.
# TransientApiError signals a retryable failure (HTTP 429/5xx, network, a
# bad finishReason) - the main loop's `catch [TransientApiError]` clause
# (in RetryState.ps1's Resolve-TransientFailure) is what actually decides
# to defer or give up on it.

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

class TransientApiError : Exception {
    TransientApiError([string]$m) : base($m) {}
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
