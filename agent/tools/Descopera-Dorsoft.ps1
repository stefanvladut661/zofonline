<#
.SYNOPSIS
    Descopera unde si cum isi tine Dorsoft datele, pe calculatorul din locatie.

.DESCRIPTION
    Se ruleaza PRIMA, inainte de a configura agentul. Nu instaleaza nimic, nu
    modifica nimic, nu scrie NICIODATA in baza Dorsoft — doar citeste si scrie
    un raport pe Desktop.

    Cauta, in ordine:
      1. procesele care ruleaza si folderele lor
      2. intrarile din registru (programe instalate)
      3. locurile obisnuite de pe disc
      4. fisiere de baze de date (.accdb .mdb .fdb .db .sqlite .dbf)
      5. siruri de conexiune din fisierele de configurare
      6. DSN-uri ODBC si instante SQL Server

    Pentru fiecare baza Access gasita listeaza tabelele, coloanele si numarul de
    randuri, si incearca sa ghiceasca ce tabel tine produsele, stocul si vanzarile.

.PARAMETER Cale
    Cauta doar in aceasta cale (mai rapid, daca stii deja unde e instalat Dorsoft).

.PARAMETER Parola
    Parola bazei Access, daca e protejata.

.PARAMETER CuMostre
    Include cateva randuri de exemplu din tabele. Valorile din coloanele care par
    date personale (nume, CNP, telefon, adresa) sunt mascate automat.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\Descopera-Dorsoft.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\Descopera-Dorsoft.ps1 -CuMostre
#>

[CmdletBinding()]
param(
    [string] $Cale,
    [string] $Parola,
    [switch] $CuMostre
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

# ─── Raport ──────────────────────────────────────────────────────────────────

$script:Raport = New-Object System.Collections.Generic.List[string]

function Scrie {
    param([string] $Text = '', [string] $Culoare = 'Gray')
    Write-Host $Text -ForegroundColor $Culoare
    $script:Raport.Add($Text)
}

function Titlu {
    param([string] $Text)
    Scrie ''
    Scrie ('─' * 74) 'DarkGray'
    Scrie "  $Text" 'Cyan'
    Scrie ('─' * 74) 'DarkGray'
}

# ─── Mascare date personale (GDPR) ───────────────────────────────────────────
# E o clinica medicala. Raportul asta ajunge prin email, deci nicio valoare care
# ar putea fi date de pacient nu are voie sa iasa din calculator in clar.

$TiparePersonale = @(
    'nume', 'prenume', 'pacient', 'client', 'cnp', 'telefon', 'tel', 'mobil',
    'email', 'mail', 'adresa', 'strada', 'oras', 'localitate', 'judet',
    'cod_postal', 'codpostal', 'iban', 'serie', 'buletin', 'ci_', 'diagnostic',
    'observatii', 'note', 'medic', 'doctor', 'reteta', 'dioptrii'
)

function Este-CampPersonal {
    param([string] $NumeColoana)
    $n = $NumeColoana.ToLower()
    foreach ($t in $TiparePersonale) {
        if ($n -like "*$t*") { return $true }
    }
    return $false
}

function Mascheaza {
    param($Valoare, [string] $NumeColoana)
    if ($null -eq $Valoare -or $Valoare -is [System.DBNull]) { return '' }
    if (Este-CampPersonal $NumeColoana) { return '«mascat»' }
    $s = [string]$Valoare
    if ($s.Length -gt 30) { return $s.Substring(0, 29) + '…' }
    return $s
}

# ─── Ghicirea rolului unui tabel ─────────────────────────────────────────────

function Ghiceste-Rol {
    param([string] $NumeTabel, [string[]] $Coloane)

    $t = $NumeTabel.ToLower()
    $c = ($Coloane -join ' ').ToLower()
    $roluri = @()

    if ($t -match 'produs|articol|marfa|stoc|item|product|nomenclator' -or $c -match 'cod_produs|codprodus|sku|barcode|cod_bare') {
        $roluri += 'PRODUSE'
    }
    if ($t -match 'stoc|gestiune|inventar|cantitat|stock' -or $c -match 'cantitate|stoc_actual|qty|quantity') {
        $roluri += 'STOC'
    }
    if ($t -match 'vanzar|vinzar|bon|factura|chitanta|comanda|tranzact|sale|invoice|receipt' -or $c -match 'nr_bon|numar_bon|data_vanzare|pret_vanzare') {
        $roluri += 'VANZARI'
    }
    return $roluri
}

# ─── Cautare fisiere de baze de date ─────────────────────────────────────────

$ExtensiiDB = @{
    '.accdb'  = 'Microsoft Access (modern)'
    '.mdb'    = 'Microsoft Access (vechi)'
    '.fdb'    = 'Firebird'
    '.gdb'    = 'Firebird / InterBase'
    '.db'     = 'SQLite / Paradox (de verificat)'
    '.sqlite' = 'SQLite'
    '.sqlite3'= 'SQLite'
    '.dbf'    = 'FoxPro / dBase'
    '.mdf'    = 'SQL Server'
}

function Cauta-BazeDeDate {
    param([string[]] $Radacini, [int] $Adancime = 4)

    $gasite = @()
    foreach ($radacina in $Radacini) {
        if (-not (Test-Path -LiteralPath $radacina)) { continue }
        Write-Host "  scanez $radacina ..." -ForegroundColor DarkGray
        try {
            $fisiere = Get-ChildItem -LiteralPath $radacina -Recurse -File -Depth $Adancime -ErrorAction SilentlyContinue |
                Where-Object { $ExtensiiDB.ContainsKey($_.Extension.ToLower()) }
            foreach ($f in $fisiere) {
                # .db si .dbf apar si ca fisiere de sistem; ignoram ce e clar irelevant
                if ($f.FullName -match '\\Windows\\|\\WinSxS\\|node_modules|\\Temp\\Temp') { continue }
                $gasite += $f
            }
        } catch { }
    }
    return $gasite | Sort-Object FullName -Unique
}

# ─── Inspectie baza Access ───────────────────────────────────────────────────

function Deschide-Access {
    param([string] $CaleFisier, [string] $ParolaDB)

    # ACE 16 intai, apoi 12 — pe masinile mai vechi exista doar 12.
    $provideri = @('Microsoft.ACE.OLEDB.16.0', 'Microsoft.ACE.OLEDB.12.0', 'Microsoft.Jet.OLEDB.4.0')
    $erori = @()

    foreach ($p in $provideri) {
        $cs = "Provider=$p;Data Source=$CaleFisier;Mode=Read;"
        if ($ParolaDB) { $cs += "Jet OLEDB:Database Password=$ParolaDB;" }
        try {
            $con = New-Object System.Data.OleDb.OleDbConnection $cs
            $con.Open()
            return @{ Conexiune = $con; Provider = $p; SirConexiune = $cs }
        } catch {
            $erori += "$p : $($_.Exception.Message)"
        }
    }
    return @{ Conexiune = $null; Erori = $erori }
}

function Inspecteaza-Access {
    param([string] $CaleFisier, [string] $ParolaDB, [bool] $Mostre)

    Scrie ''
    Scrie "  Fisier: $CaleFisier" 'White'

    $rez = Deschide-Access -CaleFisier $CaleFisier -ParolaDB $ParolaDB
    if (-not $rez.Conexiune) {
        Scrie '  NU S-A PUTUT DESCHIDE:' 'Red'
        foreach ($e in $rez.Erori) { Scrie "    $e" 'DarkRed' }
        if (($rez.Erori -join ' ') -match 'password|parola|not a valid password') {
            Scrie '  → Baza pare protejata cu parola. Reruleaza cu:  -Parola "<parola>"' 'Yellow'
        }
        return
    }

    $con = $rez.Conexiune
    Scrie "  Deschisa cu: $($rez.Provider)" 'Green'

    try {
        $schema = $con.GetSchema('Tables')
        $tabele = $schema | Where-Object { $_.TABLE_TYPE -eq 'TABLE' } | Sort-Object TABLE_NAME

        if (-not $tabele) {
            Scrie '  Nu am gasit niciun tabel.' 'Yellow'
            return
        }

        Scrie "  Tabele: $($tabele.Count)" 'White'
        Scrie ''

        foreach ($t in $tabele) {
            $nume = $t.TABLE_NAME

            # numarul de randuri
            $randuri = '?'
            try {
                $cmd = $con.CreateCommand()
                $cmd.CommandText = "SELECT COUNT(*) FROM [$nume]"
                $randuri = $cmd.ExecuteScalar()
            } catch { }

            # coloanele
            $coloane = @()
            $coloaneData = @()
            try {
                $cmd = $con.CreateCommand()
                $cmd.CommandText = "SELECT * FROM [$nume] WHERE 1=0"
                $rdr = $cmd.ExecuteReader()
                for ($i = 0; $i -lt $rdr.FieldCount; $i++) {
                    $cn = $rdr.GetName($i)
                    $ct = $rdr.GetFieldType($i).Name
                    $coloane += "$cn ($ct)"
                    $coloaneData += $cn
                    if ($ct -eq 'DateTime') { }
                }
                $rdr.Close()
            } catch {
                $coloane += "eroare la citirea coloanelor: $($_.Exception.Message)"
            }

            $roluri = Ghiceste-Rol -NumeTabel $nume -Coloane $coloaneData
            $eticheta = ''
            if ($roluri.Count -gt 0) { $eticheta = "   ⇐ posibil " + ($roluri -join ' + ') }

            $culoare = 'Gray'
            if ($roluri.Count -gt 0) { $culoare = 'Yellow' }
            Scrie ("  ▸ {0,-32} {1,8} randuri{2}" -f $nume, $randuri, $eticheta) $culoare
            Scrie ("      " + ($coloane -join ', '))

            # coloanele de tip data — candidate pentru watermark
            $dateCols = @()
            try {
                $cmd = $con.CreateCommand()
                $cmd.CommandText = "SELECT * FROM [$nume] WHERE 1=0"
                $rdr = $cmd.ExecuteReader()
                for ($i = 0; $i -lt $rdr.FieldCount; $i++) {
                    if ($rdr.GetFieldType($i).Name -eq 'DateTime') { $dateCols += $rdr.GetName($i) }
                }
                $rdr.Close()
            } catch { }
            if ($dateCols.Count -gt 0) {
                Scrie ("      watermark posibil pe: " + ($dateCols -join ', ')) 'DarkCyan'
            }

            if ($Mostre -and $roluri.Count -gt 0 -and $randuri -is [int] -and $randuri -gt 0) {
                try {
                    $cmd = $con.CreateCommand()
                    $cmd.CommandText = "SELECT TOP 3 * FROM [$nume]"
                    $rdr = $cmd.ExecuteReader()
                    $n = 0
                    while ($rdr.Read() -and $n -lt 3) {
                        $vals = @()
                        for ($i = 0; $i -lt $rdr.FieldCount; $i++) {
                            $cn = $rdr.GetName($i)
                            $vals += "$cn=$(Mascheaza $rdr.GetValue($i) $cn)"
                        }
                        Scrie ("      mostra: " + ($vals -join ' | ')) 'DarkGray'
                        $n++
                    }
                    $rdr.Close()
                } catch { }
            }
            Scrie ''
        }
    } finally {
        $con.Close()
    }
}

# ═══════════════════════════════════════════════════════════════════════════
#  START
# ═══════════════════════════════════════════════════════════════════════════

Clear-Host
Scrie ''
Scrie '  ZOF — Descoperire Dorsoft' 'Cyan'
Scrie "  $(Get-Date -Format 'dd.MM.yyyy HH:mm')  ·  $env:COMPUTERNAME  ·  $env:USERNAME"
Scrie ''
Scrie '  Acest script NU modifica nimic. Doar citeste si scrie un raport.' 'DarkGray'

# ─── 1. Procese care ruleaza ─────────────────────────────────────────────────

Titlu '1. Procese care ruleaza (posibil Dorsoft)'

$foldereCandidate = New-Object System.Collections.Generic.List[string]

$procese = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -match 'dorsoft|optic|magaz|gestiun|casa|pos'
}
if ($procese) {
    foreach ($p in $procese) {
        $caleExe = ''
        try { $caleExe = $p.Path } catch { }
        Scrie "  $($p.ProcessName)  →  $caleExe" 'Green'
        if ($caleExe) { $foldereCandidate.Add((Split-Path $caleExe -Parent)) }
    }
} else {
    Scrie '  Niciun proces evident. Daca Dorsoft ruleaza acum, spune-mi cum se' 'Yellow'
    Scrie '  numeste in Task Manager si adaug numele in cautare.' 'Yellow'
}

# ─── 2. Registru ─────────────────────────────────────────────────────────────

Titlu '2. Programe instalate (registru)'

$chei = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$gasitInRegistru = $false
foreach ($cheie in $chei) {
    $apps = Get-ItemProperty $cheie -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match 'dorsoft|optic|gestiune' }
    foreach ($a in $apps) {
        $gasitInRegistru = $true
        Scrie "  $($a.DisplayName)  $($a.DisplayVersion)" 'Green'
        if ($a.InstallLocation) {
            Scrie "     instalat in: $($a.InstallLocation)"
            $foldereCandidate.Add($a.InstallLocation)
        }
    }
}
if (-not $gasitInRegistru) { Scrie '  Nimic gasit dupa nume in registru.' 'Yellow' }

# ─── 3. Locuri obisnuite ─────────────────────────────────────────────────────

Titlu '3. Cautare fisiere de baze de date'

if ($Cale) {
    $radacini = @($Cale)
    Scrie "  Caut doar in: $Cale"
} else {
    $radacini = @(
        $foldereCandidate
        "$env:ProgramFiles"
        "${env:ProgramFiles(x86)}"
        "$env:ProgramData"
        "$env:APPDATA"
        "$env:LOCALAPPDATA"
        'C:\Dorsoft'
        'C:\Optic'
        'C:\Program'
        'D:\'
    ) | Where-Object { $_ } | Sort-Object -Unique
    Scrie '  Caut in locurile obisnuite (poate dura un minut)...'
}

$bazeGasite = Cauta-BazeDeDate -Radacini $radacini

if ($bazeGasite.Count -eq 0) {
    Scrie ''
    Scrie '  NICIO baza de date gasita in locurile cautate.' 'Red'
    Scrie '  Incearca:  .\Descopera-Dorsoft.ps1 -Cale "C:\calea\catre\Dorsoft"' 'Yellow'
} else {
    Scrie ''
    Scrie "  Gasite $($bazeGasite.Count) fisiere:" 'White'
    Scrie ''
    foreach ($f in $bazeGasite) {
        $tip = $ExtensiiDB[$f.Extension.ToLower()]
        $mb = [math]::Round($f.Length / 1MB, 1)
        $culoare = 'Gray'
        if ($mb -gt 0.5) { $culoare = 'Green' }
        Scrie ("  {0,8} MB  {1,-28}  {2}" -f $mb, $tip, $f.FullName) $culoare
        Scrie ("            modificat: {0:dd.MM.yyyy HH:mm}" -f $f.LastWriteTime) 'DarkGray'
    }
}

# ─── 4. Inspectie baze Access ────────────────────────────────────────────────

$bazeAccess = $bazeGasite | Where-Object { $_.Extension -match '\.(accdb|mdb)$' } |
    Sort-Object Length -Descending

if ($bazeAccess) {
    Titlu '4. Continutul bazelor Access'
    Scrie '  Bazele mari sunt de obicei backend-ul cu date; cele mici pot fi'
    Scrie '  doar formulare (aplicatia "split"). Le iau in ordinea marimii.'

    foreach ($b in $bazeAccess) {
        if ($b.Length -lt 100KB) {
            Scrie ''
            Scrie "  (sar peste $($b.Name) — sub 100 KB, probabil nu contine date)" 'DarkGray'
            continue
        }
        Inspecteaza-Access -CaleFisier $b.FullName -ParolaDB $Parola -Mostre $CuMostre.IsPresent
    }
} elseif ($bazeGasite.Count -gt 0) {
    Titlu '4. Continutul bazelor Access'
    Scrie '  Nicio baza Access. Motorul e altul — vezi lista de mai sus.' 'Yellow'
}

# ─── 5. Siruri de conexiune din fisiere de configurare ───────────────────────

Titlu '5. Siruri de conexiune in fisierele de configurare'

$configGasite = $false
foreach ($radacina in ($foldereCandidate | Sort-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $radacina)) { continue }
    $confs = Get-ChildItem -LiteralPath $radacina -Recurse -File -Depth 3 -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -match '\.(ini|config|xml|cfg|json|udl)$' -and $_.Length -lt 1MB }
    foreach ($c in $confs) {
        try {
            $continut = Get-Content -LiteralPath $c.FullName -Raw -ErrorAction SilentlyContinue
            if ($continut -match 'Provider=|Data Source=|Database=|Server=|DSN=|\.accdb|\.mdb|\.fdb') {
                $configGasite = $true
                Scrie ''
                Scrie "  $($c.FullName)" 'Green'
                $linii = $continut -split "`r?`n" | Where-Object {
                    $_ -match 'Provider=|Data Source=|Database=|Server=|DSN=|\.accdb|\.mdb|\.fdb'
                } | Select-Object -First 6
                foreach ($l in $linii) {
                    # nu scoatem parole in raport
                    $curat = $l -replace '(?i)(password|pwd)\s*=\s*[^;"'']+', '$1=«ascuns»'
                    Scrie "     $($curat.Trim())"
                }
            }
        } catch { }
    }
}
if (-not $configGasite) { Scrie '  Niciun sir de conexiune gasit in fisierele de configurare.' 'Yellow' }

# ─── 6. ODBC si SQL Server ───────────────────────────────────────────────────

Titlu '6. DSN-uri ODBC si instante SQL Server'

try {
    $dsn = Get-OdbcDsn -ErrorAction SilentlyContinue
    if ($dsn) {
        foreach ($d in $dsn) {
            Scrie "  DSN: $($d.Name)  [$($d.DriverName)]" 'Green'
            foreach ($k in $d.Attribute.Keys) { Scrie "     $k = $($d.Attribute[$k])" }
        }
    } else { Scrie '  Niciun DSN ODBC definit.' }
} catch { Scrie '  Nu am putut citi DSN-urile ODBC.' 'Yellow' }

$sqlSrv = Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'MSSQL|SQLEXPRESS|FirebirdGuardian|FirebirdServer|MySQL|postgres' }
if ($sqlSrv) {
    Scrie ''
    foreach ($s in $sqlSrv) {
        Scrie "  Serviciu: $($s.Name)  [$($s.Status)]  $($s.DisplayName)" 'Green'
    }
} else {
    Scrie ''
    Scrie '  Niciun serviciu de baza de date (SQL Server / Firebird / MySQL).'
}

# ─── 7. Mediu ────────────────────────────────────────────────────────────────

Titlu '7. Mediu'

Scrie "  Windows      : $((Get-CimInstance Win32_OperatingSystem).Caption)"
Scrie "  PowerShell   : $($PSVersionTable.PSVersion)"
$net = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction SilentlyContinue).Version
Scrie "  .NET Framework: $net"
try {
    $prov = (New-Object System.Data.OleDb.OleDbEnumerator).GetElements() |
        Select-Object -ExpandProperty SOURCES_NAME | Where-Object { $_ -match 'ACE|Jet' }
    Scrie "  Provideri Access: $($prov -join ', ')"
} catch { }
Scrie "  Ceas local   : $(Get-Date -Format 'dd.MM.yyyy HH:mm:ss')  (semnatura agentului accepta ±5 min)"

# ─── Salvare raport ──────────────────────────────────────────────────────────

$numeRaport = "zof-descoperire-$env:COMPUTERNAME-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
$caleRaport = Join-Path ([Environment]::GetFolderPath('Desktop')) $numeRaport
try {
    $script:Raport -join "`r`n" | Set-Content -Path $caleRaport -Encoding UTF8
    Write-Host ''
    Write-Host ('═' * 74) -ForegroundColor Cyan
    Write-Host "  Raport salvat pe Desktop:" -ForegroundColor Cyan
    Write-Host "  $caleRaport" -ForegroundColor White
    Write-Host ('═' * 74) -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  Trimite-mi fisierul asta si configurez agentul pentru schema reala.' -ForegroundColor Green
    Write-Host ''
} catch {
    Write-Host "Nu am putut salva raportul: $($_.Exception.Message)" -ForegroundColor Red
}
