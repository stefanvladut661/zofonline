# ============================================================
# CONFIG.PS1
# Setarile pe care le editezi la fiecare locatie / inainte de test.
# Restul fisierelor (DorSoftBridge.ps1 etc.) NU trebuie atinse.
# ============================================================

# --- Identitatea agentului ---
# EXACT id-ul folosit la inrolare pe server:
#   npm run server:cli -- connector:add <connector_id> <location_id> "Nume"
# Serverul stie singur din ce locatie face parte connectorul.
$ConnectorId  = "pc-locatia-1"     # <-- unic pentru fiecare PC/magazin
$AgentVersion = "1.0.0"

# --- Unde citeste bridge-ul ---
$WatchFolder = "C:\DorSoftExport"  # <-- folderul unde DorSoft salveaza exportul (verifica la fata locului)

# Bridge-ul recunoaste CE contine un fisier dupa numele lui.
# Ajusteaza dupa cum isi numeste DorSoft exporturile (vezi la fata locului).
$SalesFilePattern = "*vanzari*.csv"   # fisiere cu VANZARI (au nr. bon, cantitate, pret, data)
$StockFilePattern = "*stoc*.csv"      # fisiere cu STOC (cantitatea reala din magazin, absoluta)

# --- Unde trimite bridge-ul ---
# DOAR domeniul, fara /api/... la final - endpointurile se adauga singure.
$ServerBaseUrl = "https://dashboard.exemplu-clinica.ro"   # <-- adresa TA reala
$SecretFile    = "$PSScriptRoot\hmac.secret"   # creat de Setup-Secret.ps1, nu il edita manual

# --- Cum arata fisierul CSV exportat de DorSoft ---
# Verifica toate 3 dupa ce vezi fisierul REAL (deschide-l in Notepad, nu in Excel,
# ca sa vezi separatorul si diacriticele exact cum sunt scrise, brut)
$CsvDelimiter         = ";"    # multe exporturi romanesti folosesc ; nu , (fiindca virgula e separator zecimal)
$FileEncodingCodePage = 1250   # 1250 = Europa Centrala (RO) | 1252 = Europa de Vest | 65001 = UTF-8
$DecimalSeparator     = ","    # "," e standard RO; schimba in "." daca exportul foloseste punct

# Formatele de data pe care le poate avea coloana Data din export.
# Bridge-ul le incearca in ordine; adauga aici formatul real daca difera.
$DateFormats = @(
    'dd.MM.yyyy HH:mm:ss', 'dd.MM.yyyy HH:mm', 'dd.MM.yyyy',
    'dd/MM/yyyy HH:mm:ss', 'dd/MM/yyyy',
    'yyyy-MM-dd HH:mm:ss', 'yyyy-MM-ddTHH:mm:ss'
)

# --- Maparea coloanelor DorSoft -> campurile noastre ---
# STANGA = nu schimba (numele nostru standard, folosit in cod)
# DREAPTA = schimba cu numele EXACT al coloanei din fisierul DorSoft real

# Fisierul de VANZARI:
$SalesColumnMap = @{
    SourceRef  = "NrBon"      # numarul de bon / id-ul tranzactiei - OBLIGATORIU (previne dublarea vanzarilor)
    SKU        = "Cod"
    Cantitate  = "Cantitate"
    PretUnitar = "Pret"
    Data       = "Data"
}

# Fisierul de STOC:
$StockColumnMap = @{
    SKU       = "Cod"
    Cantitate = "Stoc"
}

# --- Ritm ---
$PollIntervalSeconds      = 30   # cat de des verifica folderul
$HeartbeatIntervalSeconds = 60   # cat de des spune serverului "sunt viu" (dashboardul marcheaza offline dupa 90s)
