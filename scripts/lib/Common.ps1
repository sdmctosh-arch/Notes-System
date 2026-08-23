# Shared low-level plumbing used by every other lib file and by
# Invoke-NoteProcessor-v2.ps1's own Setup section - logging, secret
# decryption, URL validation, and safe field access. Dot-sourced first, but
# call order among the lib files doesn't actually matter: PowerShell
# resolves a function call and script-scope variable reads at call time,
# not at dot-source time.

function Write-Log {
    param(
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet('INFO','WARN','ERROR')][string]$Level = 'INFO'
    )
    $line = "{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}" -f (Get-Date), $Level, $Message
    Write-Host $line
    if (-not $DryRun) { Add-Content -LiteralPath $LogPath -Value $line -Encoding utf8 }
}

function Get-DecryptedSecret {
    <# A DPAPI-protected secret file can hold either a bare SecureString
       (e.g. `Read-Host -AsSecureString | Export-Clixml`, how
       gemini.key.xml was made) or a PSCredential (`Get-Credential |
       Export-Clixml`, the natural thing to reach for and what this
       project's own setup instructions told a user to run for
       tmdb.key.xml). [NetworkCredential]::new() only accepts the former -
       handed a PSCredential instead, it doesn't throw, it silently
       coerces the whole object to its .ToString() (the literal string
       "System.Management.Automation.PSCredential") and returns THAT as
       the "password", with no error to signal anything went wrong. Every
       secret file this script reads goes through this function so either
       shape works, instead of requiring undocumented knowledge of which
       cmdlet to export with. #>
    param([Parameter(Mandatory)][string]$Path)

    $obj = Import-Clixml -LiteralPath $Path
    $secure = if ($obj -is [Security.SecureString]) {
        $obj
    } elseif ($obj -is [Management.Automation.PSCredential]) {
        $obj.Password
    } else {
        throw "Unexpected secret file format at $Path - expected a SecureString or a PSCredential, got $($obj.GetType().FullName)."
    }
    return [Net.NetworkCredential]::new('', $secure).Password
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
