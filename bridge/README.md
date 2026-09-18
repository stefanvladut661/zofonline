# Puntea DorSoft → Zof

Ia fișierul JSON exportat din DorSoft, îl curăță după regulile stabilite cu
owner-ul și trimite **produsele și vânzările** către serverul Zof, semnate
(contractul din [`../server/README.md`](../server/README.md) §3–4).

- **Nu atinge DorSoft.** Citește doar fișierul de export.
- **Nu trimite date de pacient.** Citește strict cele 10 coloane cunoscute; orice
  altă coloană e ignorată și raportată.
- **Nu trimite stoc** (`inventory`) — exportul conține mișcări de marfă, nu stoc
  absolut. Vine mai târziu, dintr-un export separat.
- **Fără nimic hardcodat.** Server, connector, chei — toate din `.env`.
- **Fără dependențe.** Doar Node.js 20 sau mai nou (recomandat LTS de pe nodejs.org).

## De la fișier la server — pașii, în ordine

1. DorSoft exportă fișierul JSON (ex. `ZOF-Centru-001.json`) și îl pui într-un
   folder pe calculatorul de pe care rulezi puntea.
2. **O singură dată**: creezi pe server agentul fiecărei locații și primești
   cheia (pasul 1 de mai jos), apoi completezi `bridge/.env`.
3. Rulezi **dry-run** și citești raportul (pașii 2–3).
4. Rulezi **send** (pasul 4). Verifici în dashboard.

### 1. Pregătește configurarea (o singură dată)

Copiază modelul de configurare — o singură comandă, după sistemul tău:

```
cd bridge
copy env.example .env
```

(pe Mac/Linux: `cp env.example .env`).

Cheile se creează **pe serverul unde rulează Zof** (cel din `ZOF_SERVER_URL`),
nu pe calculatorul tău — baza de date de pe calculatorul tău nu ajunge niciodată
pe server (vezi [`../DEPLOY.md`](../DEPLOY.md) §6). O dată per locație:

```
ssh <tinta>
cd /opt/zof
sudo -u zof node --env-file=.env server/cli.js location:add "Centru" fizic
sudo -u zof node --env-file=.env server/cli.js connector:add pc-centru-1 centru "PC Centru"
```

- `centru` din `connector:add` este **id-ul** afișat de `location:add`
  (`id   centru`), nu numele. Folosește exact acel id și pune-l și în
  `ZOF_FILE_LOCATIONS`.
- Ultima comandă afișează cheia API **o singură dată** — o lipești în
  `ZOF_API_KEY_CENTRU`, iar `pc-centru-1` în `ZOF_CONNECTOR_ID_CENTRU`. Dacă o
  pierzi: `connector:rotate pc-centru-1`.

Deschide `bridge/.env` și completează:

| variabilă | ce e |
|---|---|
| `ZOF_SERVER_URL` | adresa serverului, ex. `https://stoc.zof.ro` (fără `/api` la final) |
| `ZOF_FILE_LOCATIONS` | ce locație e fiecare fișier, după prefix: `ZOF-Centru=centru,ZOF-Exercitiu=exercitiu` |
| `ZOF_CONNECTOR_ID_CENTRU` / `ZOF_API_KEY_CENTRU` | agentul și cheia locației **centru** |
| `ZOF_CONNECTOR_ID_EXERCITIU` / `ZOF_API_KEY_EXERCITIU` | agentul și cheia locației **exercitiu** |

Pentru **dry-run** nu ai nevoie de server sau chei — doar de fișier.

### 2. Verifică fără să trimiți (dry-run)

```
cd bridge
npm run dry-run -- ../generated-json/ZOF-Centru-001.json
```

sau, din rădăcina proiectului: `npm run bridge:dry-run -- generated-json/ZOF-Centru-001.json`.

Se afișează raportul și se scriu în `bridge/out/`:

- `ZOF-Centru-001.payload.json` — exact ce s-ar trimite (lizibil, indentat)
- `ZOF-Centru-001.raport.txt` — același raport, ca să-l poți păstra

Poți da mai multe fișiere deodată: `npm run dry-run -- fisier1.json fisier2.json`.
Un fișier greșit nu le oprește pe celelalte; sumarul de la final spune ce a
mers și ce nu.

### 3. Citește raportul

Raportul are patru secțiuni. Ce trebuie să verifici ochiometric:

1. **CE A INTRAT** — câte bonuri se trimit, câte perechi de lentile s-au însumat,
   cât e discountul total, câte produse ajung în catalog.
2. **RECONCILIERE** — suma vânzărilor trimise **trebuie** să fie identică cu suma
   `TotalCuTVA` a bonurilor incluse. Dacă scrie `DIFERENTA`, nu trimite —
   programul oricum refuză.
3. **EXCLUSE și DE CE** — documentele de marfă (`TotalCuTVA` gol), bonurile
   sărite (suma liniilor ≠ total, sau cel mai vechi document dintr-un fișier
   plin) și documentele invalide (rând fără număr de bon, același număr de bon
   pe două documente, cantitate/preț gol sau fracționar, rând fără articol).
   Sunt listate unul câte unul, cu numărul de document, data și motivul.
4. **INCLUSE, DAR NECONFIRMATE** — lucruri trimise ca vânzări dar pe care încă nu
   le-ai confirmat în DorSoft: bonurile cu `Ridicata = 0`, liniile „Diverse
   servicii", articolele repetate la prețuri diferite, cantitățile zero/negative.

### 4. Trimite

```
cd bridge
npm run send -- ../generated-json/ZOF-Centru-001.json
```

Programul afișează întâi același raport (și îl salvează în `bridge/out/`, ca
urmă), apoi trimite și scrie răspunsul serverului: câte produse și vânzări a
acceptat și câte vânzări existau deja.

**Retrimiterea aceluiași fișier e sigură.** Serverul recunoaște bonurile deja
primite (după locație + număr de bon + articol) și le ignoră — apar la
„vânzari deja existente (ignorate)". Nu se dublează nimic.

**Trimiterea e într-un singur sens.** Un bon deja trimis **nu** se mai
actualizează și **nu** se șterge pe server dacă e modificat sau anulat ulterior
în DorSoft (serverul păstrează prima versiune primită a fiecărei linii). De aceea
bonurile din secțiunea 4 merită o privire înainte de trimitere.

### Dacă apare o eroare

| mesaj | ce înseamnă | ce faci |
|---|---|---|
| `Node.js … e prea vechi` sau comanda nu pornește deloc | Node mai vechi de 20 | rulează `node --version`; instalează Node LTS de pe nodejs.org |
| `lipsesc coloanele …` | exportul DorSoft nu mai are forma așteptată | verifică setările de export; coloanele găsite sunt listate în mesaj |
| `fisierul nu e in UTF-8` | exportul a fost salvat ca ANSI | salvează-l ca UTF-8 (altfel diacriticele ajung corupte) |
| `nu e un JSON valid` | fișierul e tăiat sau nu e JSON | re-exportă din DorSoft |
| `… nu trimit nimic din acest fisier` | o dată nu mai e în format lună/zi/an, nu există în calendar sau are un an neplauzibil | exportul s-a schimbat — nu trimite, verifică |
| `fisierul nu exista` | calea dată e greșită | verifică numele și folderul |
| `Nu stiu ce locatie e fisierul` | numele fișierului nu începe cu un prefix cunoscut (sau are litere în plus după prefix, ex. `ZOF-Centru-Nou`) | adaugă-l în `ZOF_FILE_LOCATIONS` sau dă `--location centru` |
| `--location "…" e invalid` | numele locației are spații sau majuscule | doar litere mici, cifre, `-` și `_` |
| `Pentru trimitere reala lipsesc din .env` | lipsesc server/connector/cheie | completează `bridge/.env` |
| `pare a fi cheia API, nu id-ul agentului` | ai inversat connector-ul cu cheia în `.env` | schimbă-le între ele |
| `Autentificare esuata` | cheia sau connector-ul greșit, connector creat în altă bază decât a serverului, sau ceasul calculatorului decalat cu peste 5 minute | verifică `.env` (pasul 1) și ora sistemului |
| `Serverul a raspuns 404` | `ZOF_SERVER_URL` greșit | verifică adresa; nu trebuie să conțină `/api` |
| `Serverul redirectioneaza …` | adresa din `.env` nu e cea finală (de obicei lipsește `https://`) | pune adresa finală |
| `Serverul a RESPINS datele ca invalide: sales[3].sold_at` | o înregistrare nu respectă contractul | nimic din acea cerere nu a fost scris; trimite-mi mesajul |
| `Serverul nu a putut fi contactat` | rețea / URL greșit | verifică `ZOF_SERVER_URL` și conexiunea |
| `Eroare de server (HTTP 5xx)` | serverul are o problemă temporară | așteaptă și rulează din nou — retrimiterea e sigură |
| `Cererea e prea mare pentru server` | o tranșă depășește limita serverului | trimite-mi mesajul |
| `Serverul a refuzat cererea (HTTP …)` | alt răspuns de refuz | verifică `ZOF_SERVER_URL` și configurarea |
| `Raspuns neasteptat de la …` / `Serverul confirma … dar am trimis …` | adresa răspunde, dar nu e serverul Zof (sau răspunsul e inconsistent) | verifică `ZOF_SERVER_URL` |

Coduri de ieșire: `0` totul în regulă · `2` fișier sau configurare greșită ·
`1` trimiterea a eșuat sau eroare neașteptată. `ZOF_DEBUG=1` afișează detalii
tehnice la erori.

Raportul salvat în `bridge/out/` spune în antet ce s-a întâmplat cu adevărat:
`DRY-RUN`, `TRIMITERE REALA — reusita` (cu răspunsul serverului) sau
`TRIMITERE REALA — ESUATA` (cu motivul).

## Regulile aplicate (rezumat)

Toate sunt în [`lib/rules.mjs`](lib/rules.mjs), comentate, împreună cu dovezile.

**Confirmate**

| regulă | ce face |
|---|---|
| R1 perechi de lentile | două linii identice pe același bon (lentila stângă + dreaptă) → o linie cu cantitate 2. Nu se șterge nimic. O vânzare și returul ei (cantitate negativă) rămân linii separate. |
| R2 discount | prețul negativ e discount → un singur SKU pe locație (`centru-discount`), trimis ca vânzare cu preț negativ. Nu se împarte pe produse. |
| R3 servicii | manopera, consultația rămân vânzări; în catalog au categoria `servicii`; fără stoc |
| R4 SKU | `<locație>-<ArticolRecNo>`, ex. `centru-9349`. Id-ul DorSoft e unic doar în baza locației. |
| R5 idempotență | `source_ref = NrDoc-ArticolRecNo` (unic pe linie) + `receipt_ref = NrDoc` (pentru „bon mediu") |
| R6 fără inventory | exportul nu conține stoc absolut |

**Neconfirmate — tratate conservator și vizibile în raport**

| regulă | ce face acum |
|---|---|
| N1 `Ridicata = 0` | inclus ca vânzare, listat în raport (comandă în lucru sau anulată?) — o modificare ulterioară în DorSoft nu mai ajunge pe server |
| N2 `TotalCuTVA` gol | exclus (document de marfă / recepție), listat |
| N3 suma liniilor ≠ `TotalCuTVA` | sărit (bon tăiat la marginea celor 1000 de rânduri), listat cu diferența. Într-un fișier **plin** (exact 1000 de rânduri) cel mai vechi document e sărit oricum — a fost trimis întreg dintr-un export anterior. |
| N4 „Diverse servicii" | inclus, listat separat |

Când confirmi una dintre ele, schimbarea se face într-un singur loc, în `lib/rules.mjs`.

## Ce trimite, concret

Exemplu real din `bridge/out/ZOF-Centru-001.payload.json` (bonul 16073):

```jsonc
{
  "agent_version": "dorsoft-json-bridge/1.0.0",
  "watermark": "2026-09-15T09:11:16.000Z",       // cel mai nou bon trimis
  "products": [
    { "sku": "centru-9349", "name": "Lentile RHEIN VISION Single Vision 1.6 TRANSITIONS GEN S+ ARUS BLUE",
      "category": "lentile", "price": 1097, "brand": null, "size": null, "cost_price": null, "image_url": null,
      "attributes": { "locatie": "centru", "articol_rec_no": "9349", "denumire_dorsoft": "…", "sursa": "dorsoft-json" } },
    { "sku": "centru-discount", "name": "Discount / reducere", "category": "discount", "price": null, "…": "…" }
  ],
  "sales": [
    { "source_ref": "16073-9349", "receipt_ref": "16073", "sku": "centru-9349",
      "quantity": 2, "unit_price": 1097, "sold_at": "2026-09-14T12:45:37.000Z", "channel": "fizic" },
    { "source_ref": "16073-7403", "receipt_ref": "16073", "sku": "centru-7403",
      "quantity": 1, "unit_price": 300, "sold_at": "2026-09-14T12:45:37.000Z", "channel": "fizic" },
    { "source_ref": "16073-468", "receipt_ref": "16073", "sku": "centru-468",
      "quantity": 1, "unit_price": 30, "sold_at": "2026-09-14T12:45:37.000Z", "channel": "fizic" },
    { "source_ref": "16073-discount", "receipt_ref": "16073", "sku": "centru-discount",
      "quantity": 1, "unit_price": -524, "sold_at": "2026-09-14T12:45:37.000Z", "channel": "fizic" }
  ]
}
```

2 × 1097 + 300 + 30 − 524 = **2000 lei** = `TotalCuTVA` al bonului în DorSoft.

- Orele din DorSoft sunt ora locală (`Europe/Bucharest`); se trimit în UTC, ISO 8601.
- `price` din catalog = prețul de la cea mai recentă vânzare a articolului.
- `category` e o clasificare după nume (lentile / rame / servicii / accesorii /
  discount); ce nu se recunoaște rămâne `null` — nu ghicim.
- `receipt_ref` e un câmp în plus față de contractul de azi; serverul care nu-l
  cunoaște îl ignoră fără eroare. **Până când serverul îl stochează**, „bon
  mediu" și „numărul de bonuri" din dashboard sunt calculate pe linii, nu pe
  bonuri (de rezolvat în server, nu în punte).
- Cererile mari se împart în tranșe de maximum 5000 de linii, tăiate doar între
  bonuri — un bon nu rămâne niciodată pe jumătate pe server.

## Structură

```
bridge/
  dorsoft-bridge.mjs   linia de comandă: --dry-run / --send
  lib/parse.mjs        citirea fișierului (UTF-8/UTF-16), whitelist de coloane, date, fus orar
  lib/rules.mjs        ► regulile R1–R6, N1–N4 și maparea în products + sales
  lib/report.mjs       raportul pentru verificare ochiometrică
  lib/config.mjs       tot ce vine din .env
  lib/send.mjs         semnare HMAC, împărțire în tranșe, trimitere, explicarea răspunsurilor
  test/                teste, inclusiv cap-coadă peste serverul real (npm test)
  env.example          model de configurare
  out/                 payload-uri și rapoarte (nu intră în git)
```

## Ce urmează

- **Google Drive**: un pas separat care descarcă fișierele într-un folder local,
  după care totul de mai sus rămâne neschimbat.
- **Stoc** (`inventory`): după ce există un export de stoc curent din DorSoft.
- **Rulare automată** (task programat / serviciu), după ce trimiterea manuală e
  validată pe date reale.
- **Server**: coloana `receipt_ref` în tabela `sales` (Terminalul 2), ca „bon
  mediu" să fie pe bon, nu pe linie.
