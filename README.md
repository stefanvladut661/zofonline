# Zof Stoc Online

Dashboard centralizat de stocuri și vânzări pentru clinica oftalmologică
**Zof Optogerman**. Scopul complet, constrângerile și roadmap-ul sunt în
[`plan.md`](./plan.md) — citește-l înainte de orice modificare.

## Stack

React 18 · Vite 6 · Tailwind 3 · shadcn/ui · React Router 6 · TanStack Query 5 ·
Recharts · Framer Motion

Fără backend extern. Proiectul a fost generat inițial în Base44 și a fost
**detașat complet** de el; nu mai există niciun SDK proprietar în dependențe.

## Rulare

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de producție în dist/
npm test         # suita de teste (strat de date + indicator date demo)
npm run lint     # eslint
```

Nu e nevoie de `.env` momentan.

## Structură

```
src/
  pages/              cele 10 ecrane rutate
  components/
    ui/               primitive shadcn + PageHeader, StatCard, LiveBadge
    dashboard/        cardurile de pe Dashboard
    conectori/        UI-ul de management al agenților
    layout/           AppLayout, Sidebar, MobileNav, DemoDataBanner
  lib/
    data/             ► stratul de date (vezi mai jos)
    auth/             providerul de sesiune
    hooks/            useApiPolling, useTheme, useUserRole
    api-service.js    clientul HTTP către bridge-ul Dorsoft
    data-source.js    urmărește ce ecran e pe date reale vs demo
    demo-data.js      date de test pentru dezvoltare
test/                 suita de teste + runner
```

## Stratul de date

Tot ce ține de persistență trece prin `src/lib/data/`. Restul aplicației
importă `db` din `@/lib/data` și nu știe ce e dedesubt.

| fișier | rol |
|---|---|
| `schema.js` | definițiile entităților — validare, defaults, minimizare GDPR |
| `store.js` | repository peste schemă (`list` / `filter` / `get` / `create` / `update` / `delete`) |
| `adapters/local.js` | persistență pe localStorage — **activ acum** |
| `adapters/http.js` | contractul REST către backend-ul central — pregătit, necablat |
| `index.js` | **punctul unic de swap** între adaptoare |

Când backend-ul central e gata (Faza 1 din `plan.md`), se schimbă o singură
linie în `src/lib/data/index.js`. Paginile nu se ating.

> ⚠️ Adaptorul local ține datele **doar în browserul curent**. Nu e sursă de
> adevăr pentru stoc și vânzări și nu va deveni.

## Autentificare

`src/lib/auth/session.js` e un provider **local, de dezvoltare** — nu verifică
nicio parolă și nu vorbește cu niciun server. În build de producție refuză să
pornească (fail closed), tocmai ca să nu ajungă din greșeală pe un domeniu
public. Se înlocuiește cu un provider server-side la Faza 1.

## Date demo

Ecranele cad pe `demo-data.js` când bridge-ul nu răspunde. Când se întâmplă
asta, un banner permanent și indicatorul din antet spun explicit că cifrele
sunt inventate — vezi `src/lib/data-source.js`. Nu se poate închide,
intenționat.

## Stadiu

Fazele 0–4 din planul de acțiune sunt gata: audit, restructurare, detașare de
Base44, arhitectură proprie, indicator de date demo. Urmează modelul de date
central și endpoint-ul `/ingest` (Faza 1 din `plan.md`).
