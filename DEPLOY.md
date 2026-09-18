# Punerea online — Google Cloud, gratis

Serverul stă pe o mașină virtuală `e2-micro` din nivelul **Always Free** al
Google Cloud: gratuită pe termen nelimitat, nu doar în perioada de probă.
Caddy servește dashboard-ul și trimite `/api` mai departe către Node.

```
        Internet
           │  HTTPS (certificat automat Let's Encrypt)
           ▼
    ┌──────────────────────────────────┐
    │  Caddy  :80 :443                 │
    │   /api/*  ──► Node  :3011        │   ◄── agenții din locații
    │   restul  ──► /opt/zof/dist      │   ◄── owner-ul, în browser
    └──────────────────────────────────┘
              │
        /opt/zof/data/zof.db
```

Node ascultă **doar pe interfața locală**, deci baza de date nu e accesibilă
din afară decât prin Caddy, peste HTTPS.

---

## Ce trebuie să știi despre costuri

Nivelul gratuit acoperă: o mașină `e2-micro`, 30 GB disc standard, adresa IP
publică și **1 GB de trafic de ieșire pe lună**. Dashboard-ul are ~330 KB
comprimat și rămâne în cache-ul browserului, iar datele trimise de agenți sunt
trafic de *intrare*, care nu se contorizează. La un owner și câteva locații,
consumul real e de ordinul zecilor de MB pe lună.

Trei capcane care transformă „gratis" în „facturat", toate evitabile:

| capcană | cum o eviți |
|---|---|
| Altă regiune decât cele trei permise | Alege **us-east1**, `us-central1` sau `us-west1` |
| Disc „balanced" sau SSD | Alege **Standard persistent disk**, 30 GB |
| Mașină mai mare de `e2-micro` | Lasă exact `e2-micro` |

Dacă oprești mașina, adresa IP se schimbă la repornire și trebuie actualizat
DNS-ul. Mașina fiind gratuită, cel mai simplu e să o lași pornită permanent.

---

## 1. Mașina virtuală (o faci tu, ~10 minute)

În [console.cloud.google.com](https://console.cloud.google.com) → Compute Engine
→ Create instance:

- **Region:** `us-east1` (South Carolina) — cea mai apropiată de România dintre
  cele trei gratuite
- **Machine type:** seria E2 → `e2-micro`
- **Boot disk:** Debian 12, tip **Standard persistent disk**, **30 GB**
- **Firewall:** bifează **Allow HTTP traffic** și **Allow HTTPS traffic**

După creare notează adresa IP externă.

## 2. Domeniul

Adaugă un singur record DNS la furnizorul domeniului:

```
Tip: A     Nume: stoc     Valoare: <IP-ul mașinii>
```

Rezultă `stoc.zof.ro`. Așteaptă până răspunde: `nslookup stoc.zof.ro`.
Certificatul HTTPS se obține automat, dar **doar după** ce DNS-ul e propagat.

## 3. Acces prin SSH

```powershell
gcloud compute config-ssh
```

Comanda scrie o intrare în `~/.ssh/config`, deci de aici încolo merge simplu
`ssh nume-instanta.us-east1-b.proiect`. Reține adresa asta — o folosești la
fiecare publicare.

## 4. Pregătirea serverului (o singură dată)

```powershell
scp -r deploy <tinta>:/tmp/
ssh <tinta> "sudo bash /tmp/deploy/setup-server.sh stoc.zof.ro"
```

Instalează Node 24 și Caddy, creează utilizatorul `zof` și folderele, generează
`ZOF_SECRET_KEY`, pornește HTTPS-ul și programează backup-ul zilnic.

> **Fă imediat o copie a secretului**, ținută separat de server:
> `ssh <tinta> "sudo cat /opt/zof/.env"`
> Cheile API ale agenților sunt criptate cu el. Dacă îl pierzi odată cu mașina,
> toți agenții trebuie reînrolați.

## 5. Prima publicare

```powershell
.\deploy\publica.ps1
```

Construiește dashboard-ul local, îl urcă împreună cu backend-ul și puntea prin
`gcloud compute scp/ssh`, repornește serviciul și verifică la final că
`https://stoc.zof.ro/api/health` răspunde. VM-ul, zona, proiectul și
utilizatorul sunt scrise în script (`zofonline`, `us-central1-a`,
`driveagency001`) și pot fi schimbate cu `-Instanta`, `-Zona`, `-Proiect`,
`-Utilizator` sau prin variabilele `ZOF_VM`, `ZOF_ZONE`, `ZOF_PROJECT`,
`ZOF_VM_USER`.

## 6. Contul și agenții

Baza de producție pornește goală — locațiile de pe calculatorul tău nu se
copiază, și e bine așa: pleci fără date de exercițiu.

```bash
ssh <tinta>
cd /opt/zof
sudo -u zof node --env-file=.env server/cli.js user              # primul cont e admin
sudo -u zof node --env-file=.env server/cli.js location:add "Argeș Mall" fizic
sudo -u zof node --env-file=.env server/cli.js connector:add pc-arges-1 arges-mall "PC Argeș 1"
```

Ultima comandă afișează cheia API **o singură dată** — o iei cu tine în locație.

## 7. În locație

În `Config.ps1` al bridge-ului: `$ServerBaseUrl = "https://stoc.zof.ro"` și
`$ConnectorId = "pc-arges-1"`. Restul pașilor sunt în `README.md`.

---

## Operare de zi cu zi

```bash
# Ce face serverul acum
ssh <tinta> "sudo journalctl -u zof -f"

# Starea serviciilor
ssh <tinta> "systemctl status zof caddy --no-pager"

# Backup manual, în afara celui de noapte
ssh <tinta> "sudo /opt/zof/backup.sh"

# Adu ultimul backup pe calculatorul tău
scp <tinta>:/opt/zof/backups/$(ssh <tinta> "ls -t /opt/zof/backups | head -1") .
```

**Restaurare** dintr-un backup:

```bash
sudo systemctl stop zof
sudo -u zof gunzip -c /opt/zof/backups/zof-<data>.db.gz > /opt/zof/data/zof.db
sudo systemctl start zof
```

Backup-urile se fac automat noaptea la 03:15, se verifică de integritate și se
păstrează 14 zile, în `/opt/zof/backups`. Sunt pe **același disc** cu baza: te
apără de o greșeală sau o coruptibilitate, nu de pierderea mașinii. Pentru
liniște completă, adu periodic o copie pe calculatorul tău cu comanda de mai sus.

## Publicarea unei modificări

```powershell
.\deploy\publica.ps1                  # dashboard + backend + punte
.\deploy\publica.ps1 -DoarDashboard   # doar interfața, fără repornirea serverului
.\deploy\publica.ps1 -Simuleaza       # construiește și împachetează, nu urcă nimic
```

Publicarea nu atinge niciodată `/opt/zof/data` (baza), `/opt/zof/.env`
(secretul), `/opt/zof/bridge/.env` (cheile punții) și `/opt/zof/bridge/out`
(rapoartele). Codul e înlocuit, datele rămân.

---

## Cum lucrez eu pe serverul ăsta

Codul rămâne pe calculatorul tău, în git — acela e adevărul; serverul e doar o
copie care rulează. Nu trebuie să-mi trimiți niciodată vreun export.

Dacă îmi spui ținta SSH (`ZOF_SSH`), pot să citesc log-urile live, să verific
baza, să repornesc serviciul și să public — direct din sesiune, în timp real.
Practic: „agentul din Argeș n-a mai trimis nimic de la 11" se rezolvă uitându-mă
eu în `journalctl`, nu tu.

Singurele lucruri pe care nu le pot face în locul tău sunt cele care cer cardul
și identitatea ta: crearea contului Google Cloud și cumpărarea domeniului.
