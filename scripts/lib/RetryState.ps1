# The retry/failure state machine for a single capture in the main loop.
# Not a verbatim move like the other lib files - these two functions used
# to be the inline bodies of the main loop's two catch blocks, closing over
# loop-local variables ($file, $working, $attemptsPath, $stats) and the
# catch clause's automatic $_. Lifting them out required turning those
# closures into explicit parameters (-File, -Working, -AttemptsPath,
# -Stats, -ErrorRecord) - every message string, condition, and file
# operation inside is otherwise unchanged. $MaxAttempts/$DryRun/$FailedDir
# stay as script-scope reads, the same way every other function in this
# script (e.g. Write-Log) already reads its own script-scope config.

function Resolve-TransientFailure {
    <# A TransientApiError (HTTP 429/5xx, network, bad finishReason) during
       classification or enrichment. Leave the capture in processing\ and
       retry it next run, up to $MaxAttempts, then give up and move it to
       failed\. #>
    param(
        [Parameter(Mandatory)]$File,
        [string]$Working,
        [Parameter(Mandatory)][string]$AttemptsPath,
        [Parameter(Mandatory)][hashtable]$Stats,
        [Parameter(Mandatory)]$ErrorRecord
    )

    $n = 0
    if (Test-Path -LiteralPath $AttemptsPath) { $n = [int](Get-Content -LiteralPath $AttemptsPath -Raw) }
    $n++

    if ($n -ge $MaxAttempts) {
        Write-Log "$($File.Name): transient failure $n/$MaxAttempts - giving up. $($ErrorRecord.Exception.Message)" 'ERROR'
        if (-not $DryRun) {
            $failTarget = New-UniquePath -Directory $FailedDir -FileName $File.Name
            Move-Item -LiteralPath $Working -Destination $failTarget
            Set-Content -LiteralPath "$failTarget.reason.txt" -Value $ErrorRecord.Exception.Message -Encoding utf8
            Remove-Item -LiteralPath $AttemptsPath -ErrorAction SilentlyContinue
        }
        $Stats.Failed++
    } else {
        Write-Log "$($File.Name): transient failure $n/$MaxAttempts - deferring. $($ErrorRecord.Exception.Message)" 'WARN'
        if (-not $DryRun) { Set-Content -LiteralPath $AttemptsPath -Value $n -Encoding utf8 }
        $Stats.Deferred++
    }
}

function Resolve-PermanentFailure {
    <# Anything else: no frontmatter, empty body, unparseable JSON, or any
       other unexpected error. Move straight to failed\ with a
       .reason.txt beside it - never retried. #>
    param(
        [Parameter(Mandatory)]$File,
        [string]$Working,
        [Parameter(Mandatory)][string]$AttemptsPath,
        [Parameter(Mandatory)][hashtable]$Stats,
        [Parameter(Mandatory)]$ErrorRecord
    )

    $reason = $ErrorRecord.Exception.Message
    Write-Log "$($File.Name): FAILED - $reason" 'ERROR'
    try {
        $origin = if ($Working -and (Test-Path -LiteralPath $Working)) { $Working } else { $File.FullName }
        if (-not $DryRun -and (Test-Path -LiteralPath $origin)) {
            $failTarget = New-UniquePath -Directory $FailedDir -FileName $File.Name
            Move-Item -LiteralPath $origin -Destination $failTarget
            Set-Content -LiteralPath "$failTarget.reason.txt" -Value $reason -Encoding utf8
            Remove-Item -LiteralPath $AttemptsPath -ErrorAction SilentlyContinue
        }
    }
    catch { Write-Log "$($File.Name): could not move to failed\ - $($_.Exception.Message)" 'ERROR' }
    $Stats.Failed++
}
