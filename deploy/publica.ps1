<#
============================================================
 publica.ps1 — trimite versiunea curenta pe server.
 Se ruleaza de pe calculatorul tau, din radacina proiectului:

   .\deploy\publica.ps1                  # dashboard + backend
   .\deploy\publica.ps1 -DoarDashboard   # doar interfata (mai rapid)

 Construieste dashboard-ul local si urca doar rezultatul. Motivul:
 masina de pe Google Cloud are 1 GB de RAM si un build de Vite ar
 ramane fara memorie acolo. Backend-ul nu are dependente npm, deci
 pe server nu se instaleaza absolut nimic.

 Nu atinge NICIODATA baza de date (/opt/zof/data) si nici
 configurarea cu secretul (/opt/zof/.env).
============================================================
#>
param(
    [switch]$DoarDashboard,
    [string]$Tinta = $env:ZOF_SSH   # ex. "vlad@34.121.4.55"
)

$ErrorActionPreference = 'Stop'

if (-not $Tinta) {
    Write-Host "Nu stiu unde sa public." -ForegroundColor Red
    Write-Host "Spune-mi serverul, o singura data:"
    Write-Host '  [Environment]::SetEnvironmentVariable("ZOF_SSH", "utilizator@IP", "User")'
    Write-Host "sau de fiecare data:  .\deploy\publica.ps1 -Tinta utilizator@IP"
    exit 1
}

$Radacina = Split-Path $PSScriptRoot -Parent
Set-Location $Radacina

# --- 1. Construim dashboard-ul --------------------------------------------
# "/api" (adresa relativa) inseamna ca interfata cere date de la acelasi
# domeniu de pe care e servita. Asa nu exista cereri cross-origin.
Write-Host "==> Construiesc dashboard-ul..." -ForegroundColor Cyan
$env:VITE_API_BASE_URL = "/api"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build-ul a esuat. Nu public nimic." }

# --- 2. Impachetam --------------------------------------------------------
$Arhiva = Join-Path $env:TEMP "zof-deploy.tgz"
$DeUrcat = if ($DoarDashboard) { @('dist') } else { @('dist', 'server') }

Write-Host "==> Impachetez: $($DeUrcat -join ', ')" -ForegroundColor Cyan
# Excludem server/data: pe server acolo NU e nimic (baza sta in /opt/zof/data),
# dar daca ai o baza locala de test nu vrem sa plece spre productie.
tar -czf $Arhiva --exclude='server/data' --exclude='*.map' $DeUrcat
if ($LASTEXITCODE -ne 0) { throw "Impachetarea a esuat." }

$Marime = "{0:N1} MB" -f ((Get-Item $Arhiva).Length / 1MB)
Write-Host "    $Marime"

# --- 3. Urcam si instalam -------------------------------------------------
Write-Host "==> Urc pe $Tinta..." -ForegroundColor Cyan
scp -q $Arhiva "${Tinta}:/tmp/zof-deploy.tgz"
if ($LASTEXITCODE -ne 0) { throw "Urcarea a esuat. Verifica accesul SSH." }

# Dezarhivam peste cod, repornim serviciul si verificam ca a revenit.
$Comenzi = @(
    'set -e',
    'sudo tar -xzf /tmp/zof-deploy.tgz -C /opt/zof',
    'sudo chown -R zof:zof /opt/zof/dist /opt/zof/server',
    'rm -f /tmp/zof-deploy.tgz',
    $(if ($DoarDashboard) { 'echo "Backend neatins."' } else { 'sudo systemctl restart zof' }),
    'sleep 2',
    'systemctl is-active --quiet zof && echo "Serviciul ruleaza." || (echo "SERVICIUL NU A PORNIT:"; sudo journalctl -u zof -n 30 --no-pager; exit 1)'
) -join '; '

ssh $Tinta $Comenzi
if ($LASTEXITCODE -ne 0) { throw "Instalarea pe server a esuat (vezi mesajele de mai sus)." }

Remove-Item $Arhiva -Force

# --- 4. Verificare finala din exterior ------------------------------------
$Domeniu = ssh $Tinta "grep -m1 -oP '^\S+(?= \{)' /etc/caddy/Caddyfile"
if ($Domeniu) {
    try {
        $stare = Invoke-RestMethod -Uri "https://$Domeniu/api/health" -TimeoutSec 15
        Write-Host "==> https://$Domeniu raspunde: $($stare.status), $($stare.connectors_online)/$($stare.connectors_total) agenti online" -ForegroundColor Green
    } catch {
        Write-Host "==> Serviciul ruleaza, dar https://$Domeniu/api/health nu raspunde: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "Gata." -ForegroundColor Green
