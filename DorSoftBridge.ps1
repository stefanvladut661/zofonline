<#
============================================================
 DorSoftBridge.ps1
 Citeste fisierele de export DorSoft dintr-un folder si trimite
 DOAR sku / cantitate / pret / nr. bon / data catre serverul Zof.
 NU scrie NICIODATA in DorSoft si nu atinge baza lui de date.

 Respecta contractul din server/README.md:
   - headere X-Connector-Id / X-Timestamp (ISO 8601) / X-Signature (hex)
   - semnatura HMAC-SHA256 pe "{timestamp}.{corp_brut}"
   - payload { agent_version, sales: [...] } sau { agent_version, inventory: [...] }
   - stocul e cantitate ABSOLUTA; vanzarile au source_ref (nr. bon) pentru idempotenta
   - heartbeat la interval fix, ca dashboardul sa stie ca agentul e viu

 Test rapid (o singura trecere, vizibil in consola):
   .\DorSoftBridge.ps1 -RunOnce

 Rulare normala (bucla continua, la boot) - o porneste
 Install-ScheduledTask.ps1, nu se ruleaza manual pe termen lung.
============================================================
#>
param(
    [switch]$RunOnce
)

. "$PSScriptRoot\Config.ps1"

# PowerShell 5.1 nu vorbeste TLS 1.2 din oficiu - fara linia asta, HTTPS pica.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LogFile         = "$PSScriptRoot\bridge.log"
$StateFile       = "$PSScriptRoot\processed.json"
$ProcessedFolder = Join-Path $WatchFolder "Procesate"
$RejectedFolder  = Join-Path $WatchFolder "Respinse"
$IngestLimit     = 5000   # maximul serverului per lista per cerere

function Write-Log {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | $Message"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

function Get-HmacSecret {
    if (-not (Test-Path $SecretFile)) {
        Write-Log "EROARE: nu gasesc $SecretFile. Ruleaza intai Setup-Secret.ps1."
        throw "Cheie API lipsa"
    }
    # Trim: fisierul poate avea BOM/newline la final, iar ConvertTo-SecureString
    # refuza orice caracter in plus.
    $encrypted = (Get-Content -Path $SecretFile -Raw).Trim()
    $secure = ConvertTo-SecureString $encrypted -ErrorAction Stop
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Get-ProcessedSet {
    # Virgula din fata impiedica PowerShell sa "desfaca" colectia la return
    # (un HashSet gol ar deveni altfel $null).
    if (Test-Path $StateFile) {
        $arr = @(Get-Content $StateFile -Raw | ConvertFrom-Json)
        return , [System.Collections.Generic.HashSet[string]]::new([string[]]$arr)
    }
    return , [System.Collections.Generic.HashSet[string]]::new()
}

function Save-ProcessedSet {
    param($Set)
    @($Set) | ConvertTo-Json | Set-Content -Path $StateFile
}

function Wait-FileStable {
    param([string]$Path, [int]$Retries = 5, [int]$DelaySeconds = 2)
    $lastSize = -1
    for ($i = 0; $i -lt $Retries; $i++) {
        try {
            $size = (Get-Item $Path).Length
            if ($size -eq $lastSize -and $size -gt 0) { return $true }
            $lastSize = $size
        } catch { }
        Start-Sleep -Seconds $DelaySeconds
    }
    return $false
}

function Convert-ToNumber {
    param([string]$Raw, [string]$Camp)
    $n = ("$Raw".Trim() -replace [regex]::Escape($DecimalSeparator), '.') -as [double]
    if ($null -eq $n) { throw "Valoare numerica invalida in coloana '$Camp': '$Raw'" }
    return $n
}

function Convert-ToIsoDate {
    # Serverul accepta doar ISO 8601. Exportul DorSoft e in ora locala,
    # deci convertim explicit local -> UTC.
    param([string]$Raw)
    $raw = "$Raw".Trim()
    $parsed = $null
    foreach ($fmt in $DateFormats) {
        try {
            $parsed = [datetime]::ParseExact($raw, $fmt, [Globalization.CultureInfo]::InvariantCulture)
            break
        } catch { }
    }
    if (-not $parsed) {
        try { $parsed = [datetime]::Parse($raw, [Globalization.CultureInfo]::GetCultureInfo('ro-RO')) }
        catch { throw "Data '$raw' nu se potriveste cu niciun format din `$DateFormats (Config.ps1)" }
    }
    return [datetime]::SpecifyKind($parsed, [DateTimeKind]::Local).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
}

function Assert-ColumnsExist {
    param($Rows, [hashtable]$Map, [string]$FileName)
    $found = @($Rows[0].PSObject.Properties.Name)
    $missing = @($Map.Values | Where-Object { $found -notcontains $_ })
    if ($missing.Count -gt 0) {
        throw ("In '$FileName' lipsesc coloanele: $($missing -join ', '). " +
               "Coloane gasite: $($found -join ', '). Corecteaza maparea in Config.ps1.")
    }
}

function Convert-SalesRows {
    # WHITELIST STRICT: preluam DOAR aceste campuri. Orice alta coloana din
    # fisierul DorSoft (nume client, telefon, CNP, diagnostic etc.) este
    # ignorata structural - nu ajunge in acest obiect, deci nici pe server.
    param($Rows, [string]$FileName)
    Assert-ColumnsExist -Rows $Rows -Map $SalesColumnMap -FileName $FileName

    # Un bon poate avea mai multe produse, dar serverul cere source_ref UNIC
    # per vanzare - compunem bon+sku, cu sufix daca acelasi produs apare de
    # doua ori pe acelasi bon.
    $seen = @{}
    $Rows | ForEach-Object {
        $bon = "$($_.($SalesColumnMap.SourceRef))".Trim()
        $sku = "$($_.($SalesColumnMap.SKU))".Trim()
        if (-not $bon) { throw "Rand fara numar de bon (coloana '$($SalesColumnMap.SourceRef)') in '$FileName'" }
        if (-not $sku) { throw "Rand fara SKU (coloana '$($SalesColumnMap.SKU)') in '$FileName'" }

        $key = "$bon|$sku"
        if ($seen.ContainsKey($key)) { $seen[$key]++ } else { $seen[$key] = 1 }
        $sourceRef = if ($seen[$key] -gt 1) { "$bon-$sku-$($seen[$key])" } else { "$bon-$sku" }

        [PSCustomObject]@{
            source_ref = $sourceRef
            sku        = $sku
            quantity   = Convert-ToNumber $_.($SalesColumnMap.Cantitate) $SalesColumnMap.Cantitate
            unit_price = Convert-ToNumber $_.($SalesColumnMap.PretUnitar) $SalesColumnMap.PretUnitar
            sold_at    = Convert-ToIsoDate $_.($SalesColumnMap.Data)
            channel    = "fizic"
        }
    }
}

function Convert-StockRows {
    param($Rows, [string]$FileName)
    Assert-ColumnsExist -Rows $Rows -Map $StockColumnMap -FileName $FileName
    $Rows | ForEach-Object {
        $sku = "$($_.($StockColumnMap.SKU))".Trim()
        if (-not $sku) { throw "Rand fara SKU (coloana '$($StockColumnMap.SKU)') in '$FileName'" }
        [PSCustomObject]@{
            sku      = $sku
            quantity = Convert-ToNumber $_.($StockColumnMap.Cantitate) $StockColumnMap.Cantitate
        }
    }
}

function Send-Signed {
    # Semneaza si trimite. Semnatura se calculeaza pe EXACT bytes trimisi -
    # serializam o singura data si trimitem acelasi sir.
    param([string]$Path, [string]$Body, [string]$Secret)

    $timestamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secret))
    try {
        $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$timestamp.$Body"))
    } finally { $hmac.Dispose() }
    $signature = -join ($hash | ForEach-Object { $_.ToString('x2') })

    $headers = @{
        "X-Connector-Id" = $ConnectorId
        "X-Timestamp"    = $timestamp
        "X-Signature"    = $signature
    }

    try {
        $resp = Invoke-RestMethod -Uri ($ServerBaseUrl.TrimEnd('/') + $Path) -Method Post `
            -Body ([Text.Encoding]::UTF8.GetBytes($Body)) -Headers $headers `
            -ContentType "application/json; charset=utf-8" -TimeoutSec 30
        return @{ ok = $true; response = $resp }
    } catch {
        $status = $null
        $detail = $_.Exception.Message
        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch { }
            try {
                $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                $text = $reader.ReadToEnd()
                if ($text) { $detail = $text }
            } catch { }
        }
        return @{ ok = $false; status = $status; detail = $detail }
    }
}

function Send-Batch {
    # Trimite inregistrarile in transe de maximum $IngestLimit (limita serverului).
    # Intoarce: 'ok' | 'invalid' (400 - nu are rost de reincercat) | 'retry'
    param([string]$Kind, $Records, [string]$Secret)

    for ($i = 0; $i -lt $Records.Count; $i += $IngestLimit) {
        $end = [Math]::Min($i + $IngestLimit, $Records.Count) - 1
        $chunk = @($Records[$i..$end])

        $payload = @{ agent_version = $AgentVersion }
        $payload[$Kind] = $chunk
        $body = $payload | ConvertTo-Json -Depth 5 -Compress

        $result = Send-Signed -Path '/api/ingest' -Body $body -Secret $Secret
        if ($result.ok) {
            $acc = $result.response.accepted
            Write-Log ("Server a acceptat: products=$($acc.products) inventory=$($acc.inventory) " +
                       "sales=$($acc.sales), duplicate ignorate=$($result.response.duplicates)")
        } elseif ($result.status -eq 400) {
            Write-Log "RESPINS de server (date invalide, nu reincerc): $($result.detail)"
            return 'invalid'
        } else {
            Write-Log "EROARE trimitere (status=$($result.status)): $($result.detail)"
            return 'retry'
        }
    }
    return 'ok'
}

function Send-Heartbeat {
    param([string]$Secret)
    $body = @{ agent_version = $AgentVersion } | ConvertTo-Json -Compress
    $result = Send-Signed -Path '/api/heartbeat' -Body $body -Secret $Secret
    if (-not $result.ok) {
        Write-Log "Heartbeat esuat (status=$($result.status)): $($result.detail)"
    }
    return $result.ok
}

function Move-ToFolder {
    param([string]$Path, [string]$Destination)
    if (-not (Test-Path $Destination)) {
        New-Item -Path $Destination -ItemType Directory -Force | Out-Null
    }
    Move-Item -Path $Path -Destination $Destination -Force
}

# ==================== PORNIRE ====================

Write-Log "===== Bridge pornit: connector '$ConnectorId', versiune $AgentVersion ====="
Write-Log "Urmaresc folderul: $WatchFolder (vanzari: $SalesFilePattern | stoc: $StockFilePattern)"
Write-Log "Server: $ServerBaseUrl"

if (-not (Test-Path $WatchFolder)) {
    Write-Log "ATENTIE: folderul $WatchFolder nu exista inca. Astept sa apara."
}

$Secret = Get-HmacSecret
$Processed = Get-ProcessedSet
$IgnoredWarned = [System.Collections.Generic.HashSet[string]]::new()
$EncodingObj = [System.Text.Encoding]::GetEncoding($FileEncodingCodePage)
$LastHeartbeat = [datetime]::MinValue

# Verificare rapida ca serverul e accesibil - /api/health e public.
try {
    Invoke-RestMethod -Uri ($ServerBaseUrl.TrimEnd('/') + '/api/health') -TimeoutSec 10 | Out-Null
    Write-Log "Server accesibil (health OK)."
} catch {
    Write-Log "ATENTIE: serverul nu raspunde la /api/health: $($_.Exception.Message)"
    Write-Log "Continui - poate e o problema temporara de retea."
}

# ==================== BUCLA PRINCIPALA ====================

while ($true) {
    try {
        # Heartbeat independent de date - fara el, dashboardul marcheaza
        # agentul offline chiar daca totul e in regula dar nu sunt vanzari.
        if (((Get-Date) - $LastHeartbeat).TotalSeconds -ge $HeartbeatIntervalSeconds) {
            if (Send-Heartbeat -Secret $Secret) { $LastHeartbeat = Get-Date }
        }

        $files = @(Get-ChildItem -Path $WatchFolder -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like $SalesFilePattern -or $_.Name -like $StockFilePattern })

        # Fisiere care nu se potrivesc cu niciun pattern - o singura avertizare per rulare.
        Get-ChildItem -Path $WatchFolder -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notlike $SalesFilePattern -and $_.Name -notlike $StockFilePattern } |
            ForEach-Object {
                if ($IgnoredWarned.Add($_.Name)) {
                    Write-Log "Ignor '$($_.Name)' - nu se potriveste cu niciun pattern din Config.ps1."
                }
            }

        foreach ($file in $files) {
            $fileKey = "$($file.Name)_$($file.LastWriteTimeUtc.Ticks)"
            if ($Processed.Contains($fileKey)) { continue }

            if (-not (Wait-FileStable -Path $file.FullName)) {
                Write-Log "Fisier inca in scriere, il las pentru urmatoarea trecere: $($file.Name)"
                continue
            }

            $isSales = $file.Name -like $SalesFilePattern
            Write-Log "Procesez ($(if ($isSales) {'vanzari'} else {'stoc'})): $($file.Name)"

            try {
                $rawText = [System.IO.File]::ReadAllText($file.FullName, $EncodingObj)
                $rows = @($rawText | ConvertFrom-Csv -Delimiter $CsvDelimiter)

                if ($rows.Count -eq 0) {
                    Write-Log "Fisier gol, il mut in Procesate: $($file.Name)"
                    $Processed.Add($fileKey) | Out-Null
                    Save-ProcessedSet $Processed
                    Move-ToFolder $file.FullName $ProcessedFolder
                    continue
                }

                if ($isSales) {
                    $records = @(Convert-SalesRows -Rows $rows -FileName $file.Name)
                    $outcome = Send-Batch -Kind 'sales' -Records $records -Secret $Secret
                } else {
                    $records = @(Convert-StockRows -Rows $rows -FileName $file.Name)
                    $outcome = Send-Batch -Kind 'inventory' -Records $records -Secret $Secret
                }

                switch ($outcome) {
                    'ok' {
                        Write-Log "OK - trimise $($records.Count) inregistrari din $($file.Name)"
                        $Processed.Add($fileKey) | Out-Null
                        Save-ProcessedSet $Processed
                        Move-ToFolder $file.FullName $ProcessedFolder
                    }
                    'invalid' {
                        # Datele nu se repara singure prin reincercare - le punem
                        # deoparte ca sa nu blocheze fisierele urmatoare.
                        Write-Log "Mut '$($file.Name)' in Respinse. Vezi motivul mai sus, corecteaza Config.ps1 sau exportul si pune fisierul inapoi."
                        $Processed.Add($fileKey) | Out-Null
                        Save-ProcessedSet $Processed
                        Move-ToFolder $file.FullName $RejectedFolder
                    }
                    'retry' {
                        Write-Log "Trimitere esuata, reincerc la urmatoarea trecere: $($file.Name)"
                    }
                }
            } catch {
                # Eroare de citire/format (coloana lipsa, data neinteleasa etc.)
                Write-Log "EROARE la '$($file.Name)': $($_.Exception.Message)"
                Write-Log "Mut '$($file.Name)' in Respinse. Corecteaza Config.ps1 sau exportul si pune fisierul inapoi."
                $Processed.Add($fileKey) | Out-Null
                Save-ProcessedSet $Processed
                Move-ToFolder $file.FullName $RejectedFolder
            }
        }
    } catch {
        Write-Log "EROARE in bucla principala: $($_.Exception.Message)"
    }

    if ($RunOnce) {
        Write-Log "===== -RunOnce: ies dupa aceasta trecere ====="
        break
    }

    Start-Sleep -Seconds $PollIntervalSeconds
}
