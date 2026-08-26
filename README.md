# Zof Stoc Online

Dashboard centralizat de stocuri și vânzări pentru clinica oftalmologică
**Zof Optogerman**. Scopul complet, constrângerile și roadmap-ul sunt în
[`plan.md`](./plan.md).

Owner-ul vede vânzările și stocurile din toate locațiile fără să meargă fizic în
magazine. Datele ajung acolo prin agenți instalați pe calculatoarele din
locații, care citesc read-only din aplicația de management și le trimit către
serverul central.

```
 LOCAȚIE                          CENTRAL                      CLIENT
┌──────────────────┐            ┌──────────────────┐        ┌─────────────┐
│ Aplicație        │            │  server/         │        │  src/       │
│ management       │            │  Node + SQLite   │        │  React      │
│      │ read-only │            │                  │        │             │
│      ▼           │  HTTPS     │  POST /ingest    │  HTTPS │  dashboard  │
│ Agent (bridge)   │ ─────────► │  POST /heartbeat │ ◄─────►│  owner      │
│ ⚠ de construit   │  outbound  │  agregări        │ cookie │             │
└──────────────────┘   HMAC     └──────────────────┘        └─────────────┘
```

Agentul inițiază mereu conexiunea. Niciun port deschis pe calculatoarele din
magazine, nicio dependență de IP fix.

---

## Pornire rapidă

```bash
npm install

npm run server:key           # generează ZOF_SECRET_KEY → pune-o în .env
npm run server:user          # creează primul cont (primul e automat admin)
npm run server               # backend pe :3001

npm run dev                  # dashboard pe :5173
```

Apoi definește o locație și înrolează primul agent:

```bash
npm run server:cli -- location:add "Argeș Mall" fizic
npm run server:cli -- connector:add pc-arges-1 arges-mall "PC Argeș 1"
```

Ultima comandă afișează cheia API **o singură dată**. Contractul complet pe care
trebuie să-l respecte agentul e în [`server/README.md`](./server/README.md).

## Comenzi

| comandă | ce face |
|---|---|
| `npm run dev` | dashboard în dezvoltare |
| `npm run build` | build de producție în `dist/` |
| `npm run server` | backend-ul |
| `npm test` | teste frontend (export, indicator demo, randare pagini) |
| `npm run test:server` | teste backend end-to-end peste HTTP real |
| `npm run lint` | eslint |
| `npm run server:cli` | utilitare: locații, agenți, chei API |

## Structură

```
server/            backend — sursa unică de adevăr
  db/schema.sql      modelul de date
  routes/ingest.js   recepția datelor de la agenți
  routes/dashboard.js agregările
  lib/agent-auth.js  autentificarea HMAC
  README.md          ► contractul cu agentul
src/               dashboard React
  pages/             cele 11 ecrane
  components/        ui, dashboard, conectori, layout
  lib/api/           clientul HTTP
test/              suita de teste
plan.md            contextul și roadmap-ul proiectului
```

## Configurare

Copiază `.env.example` în `.env`. Singura variabilă obligatorie e
`ZOF_SECRET_KEY` — vezi [`server/README.md`](./server/README.md) pentru restul.

> ⚠️ `ZOF_SECRET_KEY` criptează cheile API ale agenților. Dacă o pierzi, niciun
> agent nu se mai poate autentifica și trebuie regenerate toate cheile.

## Date demo

Când serverul nu răspunde, ecranele cad pe `src/lib/demo-data.js`. Când se
întâmplă, un banner permanent și indicatorul din antet spun explicit că cifrele
sunt inventate. Nu se poate închide, intenționat: date false care arată a date
reale sunt periculoase pentru deciziile owner-ului (plan.md §7.8).

## Stadiu

| fază | stare |
|---|---|
| 0 — Audit | ✅ |
| 1 — Backend, model de date, contract `/ingest` | ✅ |
| 2 — Dashboard pe date reale | ✅ |
| 3 — Agent local (conector Dorsoft) | ⬜ **urmează** |
| 4 — Sincronizare Shopify | ⬜ |
| 5 — Al doilea conector | ⬜ după confirmarea motorului DB |

Istoricul detaliat al fiecărei etape e în mesajele de commit.
