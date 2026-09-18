<#
============================================================
 publica.ps1 - trimite versiunea curenta pe VM, cu o singura comanda.
 Se ruleaza de pe calculatorul tau, din radacina proiectului:

   .\deploy\publica.ps1                  # dashboard + backend + punte
   .\deploy\publica.ps1 -DoarDashboard   # doar interfata (nu reporneste serverul)
   .\deploy\publica.ps1 -Simuleaza       # construieste si impacheteaza, NU urca nimic

 Merge prin `gcloud compute ssh/scp`, nu prin ssh direct: gcloud isi face
 singur cheia SSH si o inregistreaza pe VM (ssh-ul simplu dadea
 "Permission denied (publickey)").

 Construieste dashboard-ul local si urca doar rezultatul: VM-ul are 1 GB
 de RAM si un build de Vite ar ramane fara memorie acolo. Backend-ul si
 puntea nu au dependente npm, deci pe server nu se instaleaza nimic.

 Nu atinge NICIODATA: /opt/zof/data (baza), /opt/zof/.env (secretul),
 /opt/zof/bridge/.env (cheile puntii), /opt/zof/bridge/out (rapoartele).
============================================================
#>
param(
    [switch]$DoarDashboard,
    [switch]$Simuleaza,
    [string]$Instanta   = $(if ($env:ZOF_VM)      { $env:ZOF_VM }      else { 'zofonline' }),
    [string]$Zona       = $(if ($env:ZOF_ZONE)    { $env:ZOF_ZONE }    else { 'us-central1-a' }),
    [string]$Proiect    = $(if ($env:ZOF_PROJECT) { $env:ZOF_PROJECT } else { 'project-c273e04c-74d3-4493-a9e' }),
    [string]$Utilizator = $(if ($env:ZOF_VM_USER) { $env:ZOF_VM_USER } else { 'driveagency001' }),
    [string]$Domeniu    = $(if ($env:ZOF_DOMENIU) { $env:ZOF_DOMENIU } else { 'stoc.zof.ro' })
)

# 'Continue', nu 'Stop': npm/vite/gcloud scriu si pe stderr fara sa fie erori,
# iar PowerShell 5.1 le-ar transforma in exceptii. Verificam noi $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
$Tinta = "$Utilizator@$Instanta"
$Gcloud = @('--zone', $Zona, '--project', $Proiect, '--quiet')

function Pas($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Esec($text) { Write-Host "EROARE: $text" -ForegroundColor Red; exit 1 }

$Radacina = Split-Path $PSScriptRoot -Parent
Set-Location $Radacina

# --- 0. Verificari inainte sa facem ceva ----------------------------------
if (-not $Simuleaza) {
    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
        Esec "gcloud nu e instalat. Instaleaza Google Cloud SDK (cloud.google.com/sdk) si ruleaza 'gcloud auth login'."
    }
    $cont = gcloud auth list --filter='status:ACTIVE' --format='value(account)' 2>$null
    if (-not $cont) { Esec "gcloud nu e autentificat. Ruleaza: gcloud auth login" }
    Write-Host "Cont gcloud: $cont  |  VM: $Tinta ($Zona, $Proiect)"
}

# --- 1. Construim dashboard-ul --------------------------------------------
# "/api" (adresa relativa): interfata cere date de la acelasi domeniu de pe
# care e servita, deci nu exista cereri cross-origin.
Pas "Construiesc dashboard-ul (npm run build)..."
$env:VITE_API_BASE_URL = '/api'
npm run build
if ($LASTEXITCODE -ne 0) { Esec "Build-ul a esuat. Nu public nimic." }

# --- 2. Impachetam --------------------------------------------------------
$Arhiva = Join-Path $env:TEMP 'zof-deploy.tgz'
$DeUrcat = if ($DoarDashboard) { @('dist') } else { @('dist', 'server', 'bridge') }

Pas "Impachetez: $($DeUrcat -join ', ')"
# Excluderi: baza locala de test, fisierele .env si secretele puntii, rapoartele,
# source maps (nu au ce cauta in productie).
$Excluderi = @(
    '--exclude=server/data', '--exclude=server/.env',
    '--exclude=bridge/.env', '--exclude=bridge/out', '--exclude=bridge/node_modules',
    '--exclude=*.map'
)
tar -czf $Arhiva @Excluderi @DeUrcat
if ($LASTEXITCODE -ne 0) { Esec "Impachetarea a esuat." }

$Marime = '{0:N1} MB' -f ((Get-Item $Arhiva).Length / 1MB)
Write-Host "    $Arhiva ($Marime)"

# Plasa de siguranta: nu plecam cu vreun .env sau baza de date in arhiva.
$Continut = tar -tzf $Arhiva
$Interzis = $Continut | Where-Object { $_ -match '(^|/)\.env($|\.)' -or $_ -match '\.db(-wal|-shm)?$' -or $_ -match '^bridge/out/' }
if ($Interzis) { Esec "Arhiva contine fisiere care nu trebuie sa plece: $($Interzis -join ', ')" }

if ($Simuleaza) {
    Write-Host "==> Simulare: nimic nu a fost urcat. Arhiva ramane la $Arhiva pentru inspectie." -ForegroundColor Yellow
    Write-Host "    ($($Continut.Count) intrari)"
    exit 0
}

# --- 3. Urcam pe VM -------------------------------------------------------
Pas "Urc pe $Tinta..."
gcloud compute scp @Gcloud $Arhiva "${Tinta}:/tmp/zof-deploy.tgz"
if ($LASTEXITCODE -ne 0) { Esec "Urcarea a esuat. Verifica: gcloud compute ssh $Tinta --zone $Zona" }

# --- 4. Instalam si repornim ----------------------------------------------
# dist/ e inlocuit complet (fisierele vechi cu hash nu se mai aduna);
# server/ si bridge/ sunt suprascrise fisier cu fisier, .env-urile raman.
$Comenzi = @(
    'set -e',
    'cd /opt/zof',
    'sudo rm -rf /opt/zof/dist',
    'sudo tar -xzf /tmp/zof-deploy.tgz -C /opt/zof',
    'sudo chown -R zof:zof /opt/zof/dist' + $(if (-not $DoarDashboard) { ' /opt/zof/server /opt/zof/bridge' } else { '' }),
    'rm -f /tmp/zof-deploy.tgz',
    $(if ($DoarDashboard) { 'echo "Backend neatins (doar dashboard)."' } else { 'sudo systemctl restart zof' }),
    'sleep 2',
    'if systemctl is-active --quiet zof; then echo "Serviciul zof ruleaza."; else echo "SERVICIUL NU A PORNIT - ultimele linii din jurnal:"; sudo journalctl -u zof -n 30 --no-pager; exit 1; fi'
) -join ' && '

Pas "Instalez si repornesc serviciul..."
gcloud compute ssh @Gcloud $Tinta --command $Comenzi
if ($LASTEXITCODE -ne 0) { Esec "Instalarea pe server a esuat (vezi mesajele de mai sus). Codul vechi poate fi partial suprascris - ruleaza din nou dupa ce rezolvi cauza." }

Remove-Item $Arhiva -Force -ErrorAction SilentlyContinue

# --- 5. Verificare finala din exterior ------------------------------------
Pas "Verific https://$Domeniu/api/health ..."
try {
    $stare = Invoke-RestMethod -Uri "https://$Domeniu/api/health" -TimeoutSec 20
    Write-Host "==> https://$Domeniu raspunde: $($stare.status), $($stare.connectors_online)/$($stare.connectors_total) agenti online" -ForegroundColor Green
} catch {
    Write-Host "==> Serviciul ruleaza pe VM, dar https://$Domeniu/api/health nu raspunde de aici: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "    Verifica pe VM:  gcloud compute ssh $Tinta --zone $Zona --command 'curl -s http://127.0.0.1:3011/api/health'"
}

Write-Host "Gata." -ForegroundColor Green
