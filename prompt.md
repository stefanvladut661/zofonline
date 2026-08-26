# prompt.md — Prompt de pornire pentru Claude Code

> Lipește textul de mai jos ca **primul mesaj** în Claude Code, după ce ai deschis
> folderul proiectului. Contextul complet al proiectului e în `plan.md`.

---

Salut! Continuăm un proiect EXISTENT — NU pornim de la zero.

Contextul complet e în `plan.md` din rădăcina proiectului. Citește-l integral, primul,
înainte de orice.

Codul a fost generat inițial în Lovable (probabil React + Vite + TypeScript + Tailwind +
shadcn/ui, foarte probabil cu Supabase ca backend). Rolul tău: înțelegi ce există deja,
repari și completezi. NU regenera aplicația.

FAZA 0 — AUDIT. Fă DOAR asta acum, nu scrie cod încă:
1. Explorează structura (arbore de foldere, package.json, dependențe).
2. Identifică stack-ul real și backend-ul: e Supabase? Ce tabele, Edge Functions, migrații
   și configurare (.env, client) există? Confirmă sau corectează presupunerile din plan.md.
3. Mapează ecranele/funcționalitățile existente în frontend și stadiul lor (funcțional /
   pe jumătate / date mock).
4. Rulează proiectul local (sau dă-mi comenzile exacte de rulat) și notează erorile de
   build/runtime.
5. Compară cu scopul din plan.md: ce lipsește pentru recepția datelor de la agentul local,
   modelul de date pentru stoc/vânzări, sincronizarea Shopify.

Apoi OPREȘTE-TE și dă-mi un raport structurat:
- Stack + backend real (confirmat/corectat)
- Ce funcționează
- Ce e stricat (cu erorile concrete)
- Ce lipsește față de scop
- Un plan de acțiune pe pași mici, prioritizat, pe care să-l aprob ÎNAINTE de modificări mari

Reguli pe tot parcursul:
- Nu șterge/rescrie fișiere existente fără să explici de ce. Preferă modificări incrementale.
- Fă commit git înainte de schimbări mari, ca să pot da rollback.
- După fiecare pas semnificativ: rezumat scurt (ce ai schimbat și de ce).
- NU implementa încă agentul local complet — a doua bază de date e neconfirmată. Pregătește
  DOAR contractul de date (endpoint de recepție + schema payload) ca agentul să se conecteze
  ușor mai târziu.
- Fără API-uri plătite ale vendorilor. Sursa de date = citire read-only din DB local +
  fișiere export (vezi plan.md).
