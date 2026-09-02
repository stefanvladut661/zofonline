# ============================================================
# Install-ScheduledTask.ps1
# Ruleaza ca Administrator, O SINGURA DATA, dupa ce testul manual
# (.\DorSoftBridge.ps1 -RunOnce) a mers cu succes.
# ============================================================

. "$PSScriptRoot\Config.ps1"

$taskName   = "DorSoftBridge-$ConnectorId"
$scriptPath = "$PSScriptRoot\DorSoftBridge.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -AtStartup

# Bridge-ul e o bucla continua:
#  - ExecutionTimeLimit zero = fara limita (implicit Windows il omoara dupa 3 zile!)
#  - RestartCount/Interval = daca pica, Task Scheduler il reporneste singur
#  - IgnoreNew = nu porneste a doua instanta peste cea care ruleaza deja
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

Write-Host "Introdu contul Windows LOCAL sub care va rula bridge-ul."
Write-Host "Foloseste ACELASI cont cu care ai rulat Setup-Secret.ps1."
$cred = Get-Credential

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password `
    -RunLevel Limited `
    -Description "Bridge DorSoft -> Dashboard Zof. Doar citeste fisiere export, nu scrie niciodata in DorSoft." `
    -Force

Write-Host ""
Write-Host "OK - task '$taskName' inregistrat, va porni automat la fiecare boot."
Write-Host "Ca sa-l pornesti ACUM, fara restart:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Ca sa vezi ce face:"
Write-Host "  Get-Content '$PSScriptRoot\bridge.log' -Wait"
