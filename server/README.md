# Backend Zof — contractul cu agentul din locație

Acest document e specificația pe care trebuie să o respecte **bridge-ul instalat
pe calculatoarele din magazine**. Serverul e deja implementat și testat conform
ei (`npm run test:server`, 73 verificări).

---

## 1. Pornire

```bash
npm run server:key      # generează ZOF_SECRET_KEY → pune-o în .env
npm run server:user     # creează primul cont (primul e automat admin)
npm run server          # pornește pe :3001
```

Variabile de mediu (fișier `.env` în rădăcină):

| variabilă | obligatorie | implicit | rol |
|---|---|---|---|
| `ZOF_SECRET_KEY` | **da** | — | 32 bytes hex. Criptează cheile API și semnează sesiunile |
| `ZOF_DB_FILE` | nu | `server/data/zof.db` | fișierul SQLite |
| `PORT` | nu | `3001` | portul |
| `ZOF_CORS_ORIGINS` | nu | `localhost:5173-5175` | originile permise, separate prin virgulă |
| `NODE_ENV` | nu | — | `production` activează cookie-uri `Secure` |

> ⚠️ **`ZOF_SECRET_KEY` nu se pierde și nu se schimbă.** Cheile API ale
> agenților sunt criptate cu ea. Dacă o pierzi, niciun agent nu se mai poate
> autentifica și trebuie regenerate toate cheile.

## 2. Înrolarea unui agent

```bash
npm run server:cli -- location:add "Argeș Mall" fizic
npm run server:cli -- connector:add pc-arges-1 <location_id> "PC Argeș 1"
```

Comanda afișează cheia API **o singură dată**. Serverul o păstrează criptată și
nu o mai poate arăta niciodată. Dacă se pierde:

```bash
npm run server:cli -- connector:rotate pc-arges-1
```

---

## 3. Autentificarea agentului

**Cheia API nu circulă niciodată pe rețea.** Agentul o folosește doar ca să
semneze cererea.

Fiecare cerere are trei headere:

| header | conținut |
|---|---|
| `X-Connector-Id` | id-ul agentului, ex. `pc-arges-1` |
| `X-Timestamp` | momentul cererii, ISO 8601 |
| `X-Signature` | `HMAC-SHA256(api_key, "{timestamp}.{corp_brut}")` în hex |

Semnătura se calculează pe **corpul brut exact**, byte cu byte — nu pe JSON-ul
reserializat. Dacă agentul serializează de două ori diferit, semnătura nu se
mai potrivește.

### Ce respinge serverul

| situație | răspuns |
|---|---|
| headere lipsă | `401` |
| semnătură greșită | `401` |
| corpul modificat după semnare | `401` |
| `X-Timestamp` mai vechi de 5 minute | `401` — *verifică ceasul calculatorului* |
| aceeași semnătură retrimisă | `401` (anti-replay) |
| connector necunoscut sau cheie revocată | `401` |

### Exemplu de semnare — Node.js

```js
import crypto from 'node:crypto';

function send(path, apiKey, connectorId, payload) {
  const body = JSON.stringify(payload);          // serializează O SINGURĂ DATĂ
  const timestamp = new Date().toISOString();
  const signature = crypto
    .createHmac('sha256', apiKey)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  return fetch(`https://api.exemplu.ro${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Connector-Id': connectorId,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    body,                                        // exact aceiași bytes
  });
}
```

### Exemplu de semnare — Python

```python
import hmac, hashlib, json, datetime, requests

def send(path, api_key, connector_id, payload):
    body = json.dumps(payload, separators=(',', ':'))   # serializează o singură dată
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    signature = hmac.new(
        api_key.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256
    ).hexdigest()

    return requests.post(
        f"https://api.exemplu.ro{path}",
        headers={
            "Content-Type": "application/json",
            "X-Connector-Id": connector_id,
            "X-Timestamp": timestamp,
            "X-Signature": signature,
        },
        data=body,                                       # `data`, nu `json=`
    )
```

> Atenție în Python: folosește `data=body`, nu `json=payload`. Cu `json=`,
> `requests` reserializează și semnătura nu se mai potrivește.

---

## 4. `POST /api/ingest`

Endpoint-ul principal. Trimite produse, stoc și vânzări într-un singur batch.

```jsonc
{
  "agent_version": "1.0.0",
  "watermark": "2026-08-26T12:00:00.000Z",   // vezi §6

  // Opțional: fișierul de export din care vin datele și data lui (mtime, ISO 8601).
  // Dashboard-ul afișează „date din <data>" în loc de „Live" — exportul se face
  // a doua zi, deci cifrele nu sunt niciodată „de acum". Serverul reține doar
  // cea mai nouă dată per agent (retrimiterea unui fișier vechi nu o dă înapoi).
  "source_file_name": "ZOF-Centru-001.json",
  "source_file_mtime": "2026-09-17T06:12:33.000Z",

  "products": [
    {
      "sku": "RB-3025-001",       // OBLIGATORIU — cheia de join cu tot restul
      "name": "Aviator Classic",
      "brand": "Ray-Ban",
      "category": "Unisex",
      "size": "M",
      "price": 1290,
      "cost_price": 600,
      "image_url": null,
      "attributes": { }           // JSON liber, specific vendorului
    }
  ],

  "inventory": [
    {
      "sku": "RB-3025-001",       // OBLIGATORIU
      "quantity": 12              // OBLIGATORIU — cantitate ABSOLUTĂ, nu delta
    }
  ],

  "sales": [
    {
      "source_ref": "BON-1001",   // OBLIGATORIU — cheia de idempotență
      "sku": "RB-3025-001",       // OBLIGATORIU
      "quantity": 1,              // OBLIGATORIU
      "unit_price": 1290,         // OBLIGATORIU
      "sold_at": "2026-08-26T11:30:00.000Z",  // OBLIGATORIU, ISO 8601
      "channel": "fizic"          // "fizic" | "online", implicit "fizic"
    }
  ]
}
```

Toate cele trei liste sunt opționale, dar cererea nu poate fi complet goală.
Maximum 5000 de înregistrări per listă per cerere.

**Răspuns:**

```json
{
  "ok": true,
  "accepted":   { "products": 2, "inventory": 2, "sales": 2 },
  "duplicates": 0,
  "watermark":  "2026-08-26T12:00:00.000Z",
  "data_as_of": "2026-09-17T06:12:33.000Z",
  "server_time":"2026-08-26T12:00:01.123Z"
}
```

`duplicates` = vânzări respinse pentru că `source_ref` fusese deja înregistrat.
**Nu e o eroare** — e confirmarea că idempotența funcționează.

### Reguli pe care se bazează agentul

**Stocul e absolut, nu incremental.** Trimite cantitatea reală din locație, nu
diferența. Un delta pierdut ar desincroniza permanent; o cantitate absolută se
autocorectează la următorul sync.

**Vânzările sunt idempotente pe `(locație, source_ref)`.** Poți retrimite
același batch de câte ori vrei. `source_ref` trebuie să fie stabil și unic per
locație — numărul de bon sau id-ul tranzacției din Dorsoft. Nu genera un id nou
la fiecare citire.

**Batch-ul e atomic.** Ori intră tot, ori nimic. Dacă o singură înregistrare e
invalidă, serverul răspunde `400` cu câmpul exact (`sales[1].sold_at`) și nu
scrie nimic. Un agent căruia i se taie curentul la jumătatea trimiterii nu lasă
date pe jumătate.

**Nu trimite date de pacient.** Doar SKU, cantitate, preț, locație, timestamp.
Serverul nu are unde să le pună — nu există coloane pentru ele.

---

## 5. `POST /api/heartbeat`

Trimite la fiecare 30–60 de secunde, chiar și când nu sunt date noi.

```json
{ "agent_version": "1.0.0" }
```

Fără heartbeat, dashboard-ul nu poate distinge un agent căzut de unul care doar
n-a avut vânzări. Un agent care tace peste pragul lui (implicit 90s) e marcat
automat `offline` și apare ca atare pe ecranul Conectori.

## 6. `GET /api/sync-state`

Aceleași headere de semnătură (corpul semnat e șirul gol).

```json
{
  "connector_id": "pc-arges-1",
  "location_id": "loc-arges",
  "last_watermark": "2026-08-26T12:00:00.000Z",
  "last_heartbeat_at": "2026-08-26T12:00:30.000Z",
  "server_time": "2026-08-26T12:01:00.000Z"
}
```

**Watermark-ul** e mecanismul de sincronizare incrementală (plan.md §7.3).
Agentul citește din baza vendorului doar înregistrările cu
`modified_at > last_watermark`, apoi trimite noul watermark odată cu datele.
Serverul îl avansează **numai după** ce datele au intrat cu succes — dacă
tranzacția cade, agentul reia din același punct.

La pornire, agentul cheamă acest endpoint ca să afle de unde continuă. Așa
supraviețuiește unei reporniri fără să reciteasă toată baza.

---

## 7. Ce trebuie să facă agentul (rezumat pentru implementare)

Conform plan.md §7:

1. **Serviciu Windows**, cu auto-restart la crash și la reboot.
2. **Read-only strict** pe baza Dorsoft. Nu scriem niciodată înapoi.
3. La pornire: `GET /api/sync-state` → află `last_watermark`.
4. Ciclu de poll: citește din Dorsoft `WHERE modified_at > watermark`.
5. **Buffer local SQLite (outbox)**: scrie întâi local, apoi trimite. Supravie-
   țuiește căderilor de rețea.
6. `POST /api/ingest` cu retry și **backoff exponențial**. Un `400` nu se
   reîncearcă (datele sunt invalide) — se loghează și se sare. Un `5xx` sau o
   eroare de rețea se reîncearcă.
7. `POST /api/heartbeat` la 30–60s, independent de ciclul de date.
8. **Config extern** (nu recompilat): connection string, query-urile SQL,
   URL-ul serverului, cheia API, intervalul de poll.
9. La pornire **validează că există coloanele așteptate** în Dorsoft și cade
   zgomotos cu mesaj clar dacă lipsesc.
10. **Logging în fișiere rotative**, ca orice eroare să fie diagnosticabilă fără
    remote desktop.

---

## 8. Toate rutele

### Agent — semnătură HMAC
| metodă | rută |
|---|---|
| POST | `/api/ingest` |
| POST | `/api/heartbeat` |
| GET | `/api/sync-state` |

### Dashboard — sesiune (cookie)
| metodă | rută |
|---|---|
| POST | `/api/auth/login`, `/api/auth/logout` |
| GET | `/api/auth/me` |
| GET | `/api/dashboard`, `/api/sales`, `/api/products`, `/api/stock`, `/api/alerts` |
| GET | `/api/top-products`, `/api/locations`, `/api/daily-sales`, `/api/monthly-sales` |
| GET | `/api/shopify-orders`, `/api/performance`, `/api/categories`, `/api/brands` |

### Administrare — sesiune cu rol `admin`
| metodă | rută |
|---|---|
| GET/POST/PATCH | `/api/admin/locations` |
| GET/POST/PATCH/DELETE | `/api/admin/connectors` |
| POST | `/api/admin/connectors/:id/rotate-key` |
| GET | `/api/admin/sync-events` |
| GET/PATCH | `/api/admin/settings` |

### Public
| metodă | rută |
|---|---|
| GET | `/api/health` |

---

## 9. Înainte de producție

- [ ] **HTTPS obligatoriu.** Agentul trimite date de business; fără TLS totul e
      în clar. Un reverse proxy (Caddy/nginx) cu certificat Let's Encrypt.
- [ ] `NODE_ENV=production` — activează `Secure` pe cookie-ul de sesiune.
- [ ] `ZOF_CORS_ORIGINS` setat pe domeniul real al dashboard-ului.
- [ ] `ZOF_SECRET_KEY` în secret store, nu în repo. Backup separat de baza de date.
- [ ] Backup automat al fișierului SQLite.
- [ ] Ceasurile calculatoarelor din locații sincronizate (NTP) — fereastra de
      semnătură e ±5 minute.
