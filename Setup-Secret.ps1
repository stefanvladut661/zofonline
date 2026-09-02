# ============================================================
# Setup-Secret.ps1
# Ruleaza O SINGURA DATA pe acest PC, INAINTE de a testa bridge-ul.
# Ruleaza-l logat cu ACELASI cont Windows sub care va rula Scheduled
# Task-ul mai tarziu (altfel cheia criptata nu va putea fi decriptata).
# ============================================================

. "$PSScriptRoot\Config.ps1"

$secureSecret = Read-Host "Introdu cheia API a connectorului (afisata O SINGURA DATA de connector:add; nu apare pe ecran)" -AsSecureString
$encrypted = ConvertFrom-SecureString $secureSecret
Set-Content -Path $SecretFile -Value $encrypted -Encoding UTF8

Write-Host ""
Write-Host "OK - cheia a fost salvata criptat in: $SecretFile"
Write-Host "Urmatorul pas: testeaza cu   .\DorSoftBridge.ps1 -RunOnce"
