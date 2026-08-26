# plan.md — Dashboard Centralizat Clinică Oftalmologică

> Document de referință pentru proiect. Claude Code trebuie să citească acest fișier
> **integral** înainte de orice modificare de cod. Nu regenera aplicația de la zero —
> auditează, repară, completează și aliniază codul existent cu scopul de mai jos.

---

## 1. Scopul proiectului

Owner-ul unei clinici oftalmologice cu mai multe locații fizice vrea un dashboard online
prin care să vadă, **fără să meargă fizic în magazine**:

- vânzările pe fiecare locație, în timp cvasi-real (near-real-time, secunde–minute);
- nivelul exact al stocurilor pe fiecare locație și agregat;
- rapoarte: vânzări/locație, cele mai vândute perechi de ochelari, stocuri la zi,
  extrase complete de vânzări.

În plus, stocurile centralizate trebuie **trimise automat în Shopify** (magazin
e-commerce) ca să fie actualizate la zi și să nu apară oversell.

Sursa datelor: **două programe de management desktop, offline**, care rulează în locații
și gestionează stocuri, vânzări, facturi.

---

## 2. Constrângeri de bază (NON-negociabile)

- **Fără API-uri plătite ale vendorilor.** Costul lor e prohibitiv. Datele se extrag
  prin citire directă read-only din baza de date locală și/sau prin fișiere de export.
- **Agent local obligatoriu.** Un serviciu care rulează pe PC-ul din locație și trimite
  datele către dashboard. Trebuie să fie **robust și cu mentenanță mică** — vezi §7.
- **Read-only pe bazele vendorilor.** Nu scriem NICIODATĂ înapoi în baza de date a
  aplicațiilor de management. Doar citim.
- **GDPR.** E clinică medicală. Facturile/vânzările pot conține date de pacient.
  Extragem doar strictul necesar dashboard-ului (SKU, cantitate, preț, locație,
  timestamp). **Fără identificatori de pacient** în dashboard sau în Shopify.
- **Comunicare outbound.** Agentul inițiază conexiunea către server (HTTPS). Nu deschidem
  porturi pe PC-urile din locații, nu depindem de IP fix.

---

## 3. Stadiul actual

- Există un **dashboard construit în Lovable** (frontend). Presupunere de verificat de
  către Claude Code: React + Vite + TypeScript + Tailwind + shadcn/ui, foarte probabil cu
  **Supabase** ca backend (auth + Postgres + Edge Functions). **CONFIRMĂ sau CORECTEAZĂ**
  aceste presupuneri în faza de audit.
- **Sursa de date 1:** bază de date **Microsoft Access** (`.accdb`/`.mdb`). Cunoscută.
- **Sursa de date 2:** motor de DB **încă neconfirmat** (owner verifică). Se tratează ca
  un conector separat, plugabil, ce va fi definit ulterior.
- Agentul local **nu există încă**.
- Integrarea Shopify **nu există încă**.

---

## 4. Arhitectură țintă

```
 LOCAȚIA A                         LOCAȚIA B (a 2-a bază, TBD)
 ┌─────────────────┐               ┌─────────────────┐
 │ App management  │               │ App management  │
 │ (Access .accdb) │               │ (motor TBD)     │
 │      │ read-only│               │      │ read-only│
 │      ▼          │               │      ▼          │
 │ Local Agent     │               │ Local Agent     │
 │ + buffer SQLite │               │ + buffer SQLite │
 └───────┬─────────┘               └───────┬─────────┘
         │ HTTPS (outbound, HMAC/mTLS)     │
         └──────────────┬──────────────────┘
                        ▼
        ┌───────────────────────────────────┐
        │  BACKEND CENTRAL (sursă de adevăr) │
        │  Supabase Postgres + Edge Function │
        │  - endpoint /ingest (upsert)       │
        │  - agregare stoc, rapoarte         │
        │  - heartbeat agenți                │
        └───────┬───────────────────┬────────┘
                │                   │
                ▼                   ▼
        ┌───────────────┐   ┌──────────────────┐
        │ DASHBOARD      │   │ Shopify Admin API│
        │ (Lovable/React)│   │ inventory levels │
        │ owner vede live│   │ + webhook comenzi│
        └───────────────┘   └──────────────────┘
```

**Fluxul de date:** Agent citește incremental → buffer local → POST la `/ingest` →
backend face UPSERT în Postgres (sursa unică de adevăr) → dashboard citește/abonează
realtime → un worker împinge nivelurile de stoc în Shopify (batch, cu debounce).

---

## 5. Componente

### 5.1 Frontend dashboard (Lovable/React) — EXISTĂ, de auditat
Ecrane țintă: vânzări/locație, top perechi de ochelari, stocuri la zi (per locație +
agregat), extrase de vânzări, plus un indicator de "sănătate" a agenților (când a fost
ultima sincronizare per locație). Claude Code trebuie să vadă ce e deja implementat și în
ce stadiu (funcțional / pe jumătate / date mock).

### 5.2 Backend / sursă de adevăr — probabil Supabase
- Postgres = sursa unică de adevăr pentru vederea agregată.
- Endpoint de recepție `/ingest` (Edge Function) unde agentul trimite datele.
- Logica de agregare stoc pe locații și generarea rapoartelor.
- Toate mutațiile de stoc trec **serializat per SKU** prin backend (evită race condition).

### 5.3 Local Agent — DE CONSTRUIT (piesa critică). Vezi §7.

### 5.4 Sincronizare Shopify — DE CONSTRUIT
- **Cheia de legătură între sisteme = SKU.** Tot maparea se face pe SKU.
- Actualizare stoc prin Shopify Admin API (InventoryLevel / GraphQL Admin API).
- Atenție la rate limits (leaky bucket / cost-based). **Batch + debounce** pe update-uri.
- Decizie de luat: fiecare locație fizică → o locație Shopify, SAU agregăm totul într-o
  singură locație de fulfillment online? (vezi §10)
- **Webhook pe comenzile online** → decrementează și stocul intern la vânzare pe e-commerce.
- **Buffer anti-oversell:** păstrează o marjă de siguranță în Shopify (ex. nu afișa sub un
  prag, sau afișează cu 1 mai puțin) pentru că două canale vând din același stoc fizic.
- Verifică versiunea curentă a Admin API în docs Shopify (se schimbă trimestrial).

---

## 6. Model de date (draft — de rafinat în audit)

Tabele în Postgres central:

- **locations**: `id`, `name`, `code`, `shopify_location_id`, `is_active`
- **products**: `id`, `sku` (UNIQUE — cheia de join), `name`, `category` (tip ramă/lentilă),
  `brand`, `attributes` (jsonb)
- **inventory**: `id`, `sku`, `location_id`, `quantity`, `updated_at`
  (stoc per produs per locație; UNIQUE pe `(sku, location_id)`)
- **sales**: `id`, `location_id`, `sku`, `quantity`, `unit_price`, `sold_at`,
  `source_ref` (cheie de idempotență din sistemul sursă), `created_at`
  (UNIQUE pe `(location_id, source_ref)` ca retrimiterea să nu dubleze)
- **sync_state**: `location_id`, `last_heartbeat_at`, `last_watermark`, `status`, `agent_version`
- **shopify_sync_log**: `sku`, `location_id`, `pushed_quantity`, `status`, `pushed_at`, `error`

Principii:
- **UPSERT peste tot**, niciodată insert simplu — retrimiterile agentului nu trebuie să dubleze.
- Sincronizare incrementală prin **watermark**: agentul cere doar înregistrări cu
  `modified_at > last_watermark`.

---

## 7. Local Agent — principii anti-fragilitate (partea la care ținem cel mai mult)

Scopul: agent stabil, care nu se strică la fiecare update al aplicației și nu cere
intervenție manuală. Reguli de design:

1. **Rulează ca serviciu Windows** (auto-restart la crash/reboot). Opțiuni: .NET Worker
   Service (cel mai natural pe Windows), sau Python + NSSM / Task Scheduler.
2. **Read-only strict** pe baza vendorului. User de DB read-only dacă motorul permite.
   Nu scriem niciodată înapoi.
3. **Sincronizare incrementală** (watermark pe `modified_at`), NU citire completă de
   fiecare dată. Reduce încărcarea și riscul de blocaj.
4. **Buffer local în SQLite (outbox pattern):** agentul scrie întâi local, apoi trimite.
   Supraviețuiește căderilor de rețea. Retry cu **backoff exponențial**.
5. **Idempotență:** fiecare payload are o cheie unică → server face upsert → zero duplicate
   la retrimitere.
6. **Config-driven, nu hardcodat.** Connection string, query-urile SQL, endpoint-ul,
   intervalul de poll — toate într-un fișier de config extern. Când se schimbă schema sau
   calea DB-ului, editezi config, **nu recompilezi**.
7. **Rezistență la schimbări de schemă:** centralizează TOATE query-urile într-un singur
   loc; la pornire validează că există coloanele așteptate și **cade zgomotos cu mesaj clar**
   dacă lipsesc — mai bine o eroare vizibilă decât date greșite în tăcere.
8. **Heartbeat** periodic către server → dashboard-ul alertează dacă un agent tace.
   Date de stoc vechi afișate ca proaspete sunt periculoase pentru deciziile owner-ului.
9. **Logging structurat** cu fișiere rotative. Orice eroare trebuie să fie diagnosticabilă
   fără remote desktop.
10. **Abstracție de "conector" per sursă:** o interfață comună (`read_since(watermark) ->
    records`), cu o implementare pentru Access acum și o a doua implementare (TBD) mai
    târziu. Contractul de date către server rămâne identic indiferent de sursă.

> Notă TCO onestă: pentru a doua sursă, dacă DB-ul e criptat/inaccesibil și exporturile
> insuficiente, ultima soluție e RPA (automatizare UI cu pywinauto / Power Automate
> Desktop). E cea mai fragilă și scumpă la mentenanță — de evitat dacă se poate.

---

## 8. Metode de extracție per sursă (în ordinea preferată)

**A. Citire directă read-only din DB local** — cea mai bună când e posibilă. Date
structurate, complete, cvasi-real-time.

**B. Parsing fișiere export (CSV/Excel/XML)** — deseori "sweet spot": mecanism suportat
oficial de vendor, robust la schimbări interne de schemă. Dezavantaj: batch, nu real-time pur.

**C. RPA / automatizare UI** — DOAR ca ultimă soluție (vezi nota din §7).

### Sursa 1 — Microsoft Access (`.accdb`/`.mdb`)
- Citire prin ODBC ("Microsoft Access Driver") sau OLEDB (`ACE.OLEDB.12.0`).
  Din Python: `pyodbc`. Din .NET: `System.Data.OleDb`.
- Atenție: Access poate fi **blocat** când aplicația îl ține deschis → conexiune read-only
  + retry. Fișierul poate fi **protejat cu parolă** (nevoie de parola DB).
- Dacă aplicația e "split", țintește backend-ul de **date** (`.accdb`), nu front-end-ul cu
  formulare.

### Sursa 2 — motor TBD
- De determinat: caută în directorul de instalare fișiere `.fdb`/`.gdb` (Firebird),
  `.db`/`.sqlite`, `.dbf` (FoxPro/dBase), instanțe SQL Server în servicii, connection
  strings în config. Dacă nu e clar → Process Monitor (Sysinternals) ca să vezi ce fișiere/
  procese DB atinge aplicația la salvarea unei vânzări.
- Se implementează ca un al doilea conector, cu același contract de ieșire.

---

## 9. Securitate & GDPR

- **Minimizarea datelor:** doar SKU, cantitate, preț, locație, timestamp. Fără nume/CNP/
  date de pacient în dashboard sau Shopify.
- **Autentificare agent per locație:** minim API key + semnătură HMAC pe payload; ideal mTLS.
- **Secrete** (connection strings, chei Shopify) în variabile de mediu / secret store, nu
  în cod, nu în repo.
- **TLS** pe toată comunicarea agent → backend → Shopify.

---

## 10. Întrebări deschise (de rezolvat pe parcurs)

1. Ce motor de DB folosește **a doua aplicație**? (owner verifică)
2. Backend-ul Lovable e Supabase? Ce tabele/Edge Functions/migrații există deja?
3. Mapare Shopify: o locație Shopify per magazin fizic, sau o singură locație de fulfillment
   online agregată?
4. Câmpul care ține **SKU-ul** în fiecare sistem sursă — există și e consistent între cele
   două aplicații și Shopify?
5. Există câmp de tip `modified_at`/timestamp în tabelele sursă pentru sync incremental?
6. Structura reală a tabelelor Access (nume tabele/coloane pentru produse, stoc, vânzări).

---

## 11. Faze (roadmap)

- **Faza 0 — Audit** (acum): Claude Code inventariază codul Lovable, confirmă stack-ul și
  backend-ul, rulează proiectul, notează erorile, mapează ce lipsește față de scop. Livrează
  un raport + plan de acțiune înainte de modificări mari. **Nu scrie cod în această fază.**
- **Faza 1 — Fundație backend & contract de date:** modelul de date (§6), endpoint-ul
  `/ingest` cu upsert + idempotență, autentificare agent, tabela `sync_state` + heartbeat.
  (Se poate face fără a doua sursă — pregătește terenul pentru agent.)
- **Faza 2 — Dashboard aliniat cu scopul:** conectează ecranele reale la datele din backend
  (înlocuiește mock-urile), rapoartele, indicatorul de sănătate a agenților.
- **Faza 3 — Agent local (conector Access):** citire read-only incrementală, buffer SQLite,
  retry/backoff, serviciu Windows, config-driven, logging.
- **Faza 4 — Sincronizare Shopify:** push niveluri de stoc pe SKU, batch/debounce, buffer
  anti-oversell, webhook pe comenzi.
- **Faza 5 — Al doilea conector** (după confirmarea motorului DB).

---

## 12. Sarcini imediate pentru Claude Code (Faza 0 — audit, fără cod)

1. Explorează structura proiectului (arbore de foldere, `package.json`, dependențe).
2. Identifică stack-ul real și backend-ul. E Supabase? Ce tabele / Edge Functions /
   migrații / configurare (`.env`, client) există?
3. Mapează ecranele/funcționalitățile existente în frontend și stadiul lor
   (funcțional / pe jumătate / mock).
4. Rulează proiectul local (sau spune-mi comenzile exacte de rulat) și notează erorile
   de build/runtime.
5. Compară cu scopul din acest fișier: ce lipsește pentru recepția datelor de la agent,
   modelul de date, sincronizarea Shopify.
6. **OPREȘTE-TE** și livrează un raport structurat: stack+backend real (confirmă/corectează
   presupunerile), ce funcționează, ce e stricat (cu erori concrete), ce lipsește, și un
   plan de acțiune pe pași mici prioritizat — pe care să-l aprob **înainte** de modificări
   masive.

### Reguli pe tot parcursul
- Nu șterge/rescrie fișiere existente fără explicație. Preferă modificări incrementale.
- Commit git înainte de schimbări mari (rollback ușor).
- După fiecare pas semnificativ: rezumat scurt (ce ai schimbat și de ce).
- Nu implementa încă agentul complet — a doua sursă e neconfirmată. Pregătește DOAR
  contractul de date (endpoint + schema payload) ca agentul să se conecteze ușor mai târziu.
