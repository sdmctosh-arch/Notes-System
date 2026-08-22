#requires -Version 7.0
<#
.SYNOPSIS
    Sets up a throwaway sandbox and runs the processor against it. Never
    touches E:\notes or the real E:\notes-system state.

.DESCRIPTION
    Copies a handful of files from test-corpus\ into a sandbox _Inbox, then
    runs Invoke-NoteProcessor-v2.ps1 against sandbox Vault and System roots
    only. Prompts come from this repo checkout (so you're testing the code
    that's actually in this branch, not whatever is deployed on the real
    machine). The API key still comes from the real, existing
    gemini.key.xml - reading a secret is harmless, only writes are sandboxed.

    Defaults to -DryRun: the real API gets called, nothing gets written.
    Pass -Live to actually write queue files, still only inside the sandbox.

.EXAMPLE
    .\Test-Sandbox.ps1
    .\Test-Sandbox.ps1 -Live
    .\Test-Sandbox.ps1 -SampleCount 26 -Live
#>
[CmdletBinding()]
param(
    [string]$RepoRoot    = (Split-Path $PSScriptRoot -Parent),
    [string]$SystemRoot  = 'E:\notes-system',
    [string]$SandboxRoot = 'E:\notes-system\sandbox-test',
    [int]$SampleCount    = 6,
    [string]$Model       = 'gemini-3.1-flash-lite',
    [string]$EnrichModel = 'gemini-3.5-flash',
    [switch]$Live
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$corpusDir = Join-Path $RepoRoot 'test-corpus'
if (-not (Test-Path -LiteralPath $corpusDir)) {
    throw "Can't find test-corpus\ under $RepoRoot. Run this from inside the repo checkout, or pass -RepoRoot."
}

$keyPath = Join-Path $SystemRoot 'gemini.key.xml'
if (-not (Test-Path -LiteralPath $keyPath) -and -not $env:GEMINI_API_KEY) {
    throw "No API key found at $keyPath and `$env:GEMINI_API_KEY is not set. Nothing else will work without one."
}

$sandboxVault  = Join-Path $SandboxRoot 'notes'
$sandboxSystem = Join-Path $SandboxRoot 'notes-system'
$inbox         = Join-Path $sandboxVault '_Inbox'

# Fresh sandbox every run - this folder only ever holds throwaway test state,
# so wiping it first keeps runs from bleeding into each other.
if (Test-Path -LiteralPath $SandboxRoot) {
    Write-Host "Clearing previous sandbox at $SandboxRoot"
    Remove-Item -LiteralPath $SandboxRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $inbox -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $sandboxVault 'Archive\Captures') -Force | Out-Null

$allCaptures = @(Get-ChildItem -LiteralPath $corpusDir -Filter '*.md' | Sort-Object Name)
$sample = if ($SampleCount -le 0 -or $SampleCount -ge $allCaptures.Count) {
    $allCaptures
} else {
    # CLAUDE.md's collection-unrolling gotcha: @(...) alone isn't enough
    # here, because this array is the implicit *output* of the else block,
    # not a direct assignment - a single-element array still gets flattened
    # to a scalar when it passes through as block output (the same reason
    # a function needs `return ,$hashSet`). The leading comma is what
    # actually stops the unroll; @() alone left -SampleCount 1 producing a
    # bare FileInfo with no .Count, breaking the message below.
    ,@($allCaptures | Select-Object -First $SampleCount)
}

foreach ($f in $sample) {
    Copy-Item -LiteralPath $f.FullName -Destination $inbox
}
# Backdate so the processor's "still being written, wait for it to settle"
# guard doesn't skip these on this run.
Get-ChildItem -LiteralPath $inbox -Filter '*.md' | ForEach-Object {
    $_.LastWriteTime = (Get-Date).AddHours(-1)
}

Write-Host "Sandbox ready: $($sample.Count) capture(s) copied into $inbox"
Write-Host ("Mode: {0}" -f $(if ($Live) { 'LIVE - will write queue files' } else { 'DRY RUN - no files written' }))
Write-Host ""

$processorScript = Join-Path $PSScriptRoot 'Invoke-NoteProcessor-v2.ps1'

$params = @{
    VaultRoot        = $sandboxVault
    SystemRoot       = $sandboxSystem
    PromptPath       = Join-Path $RepoRoot 'scripts\classify-prompt.md'
    EnrichPromptPath = Join-Path $RepoRoot 'scripts\enrich-prompt.md'
    KeyPath          = $keyPath
    Model            = $Model
    EnrichModel      = $EnrichModel
    DelaySeconds     = 0
}
if (-not $Live) { $params['DryRun'] = $true }

& $processorScript @params

Write-Host ""
Write-Host "Done. Queue output (if any) is under:"
Write-Host "  $sandboxSystem\queue\pending"
Write-Host ""
Write-Host "Nothing under $SandboxRoot touches your real vault or queue - safe to delete any time."
