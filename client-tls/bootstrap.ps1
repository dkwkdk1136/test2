$ErrorActionPreference = 'Stop'
try {
    $runtime = Join-Path $PSScriptRoot 'runtime\node.exe'
    $launcher = Join-Path $PSScriptRoot 'launch.js'
    if (!(Test-Path -LiteralPath $runtime -PathType Leaf)) { throw 'Bundled Node runtime missing.' }
    if (!(Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'launch.js missing.' }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        & $runtime $launcher
        exit $LASTEXITCODE
    }
    # MetalRage.exe embeds requireAdministrator. Elevate before opening bridge ports.
    Write-Host '[Launcher] Metal Rage requires administrator permission. Please approve the Windows UAC prompt.'
    $process = Start-Process -FilePath $runtime -ArgumentList ('"' + $launcher + '"') -WorkingDirectory $PSScriptRoot -Verb RunAs -WindowStyle Normal -Wait -PassThru
    exit $process.ExitCode
} catch {
    Write-Host ('[Launcher] Unable to start: ' + $_.Exception.Message)
    exit 1
}
