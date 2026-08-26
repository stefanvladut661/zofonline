/**
 * Punctul unic de cablare al stratului de date + auth.
 *
 * Tot restul aplicatiei importa `db` de aici si nu stie ce e dedesubt.
 * Cand backend-ul central e gata (Faza 1), se schimba DOAR liniile marcate
 * mai jos — zero modificari in pagini sau componente.
 */

import { createStore } from './store';
import { createLocalAdapter } from './adapters/local';
// import { createHttpAdapter } from './adapters/http';  // ← Faza 1
import { createLocalAuth } from '../auth/session';

// ─── Punctul de swap ─────────────────────────────────────────────────────────
// Faza 1 inlocuieste linia de mai jos cu:
//   const adapter = createHttpAdapter(import.meta.env.VITE_API_BASE_URL, { getToken });
const adapter = createLocalAdapter();
const auth = createLocalAuth();
// ─────────────────────────────────────────────────────────────────────────────

const store = createStore(adapter);

export const db = {
  adapter: store.adapter,
  entities: store.entities,
  auth,
};

export const { entities } = store;
export default db;
