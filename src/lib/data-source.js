import { useSyncExternalStore } from 'react';

/**
 * Urmareste, per query, daca datele afisate vin de la bridge-ul real sau din
 * demo-data.js.
 *
 * De ce exista: fiecare ecran facea `try { API } catch { DEMO }` si cadea in
 * tacere pe date inventate — 2847 produse, 1.245.680 RON stoc, unele regenerate
 * cu Math.random() la fiecare refresh. Nimic in UI nu le deosebea de datele
 * reale. plan.md §7.8 spune exact de ce e periculos: owner-ul ia decizii pe ce
 * vede pe ecran.
 *
 * Fallback-ul pe demo ramane (util in dezvoltare), dar acum e vizibil.
 */

/** @type {Map<string, boolean>} cheie query → e demo? */
const sources = new Map();
const listeners = new Set();

let snapshot = { isDemo: false, demoKeys: [], liveKeys: [] };

function recompute() {
  const demoKeys = [];
  const liveKeys = [];
  for (const [key, isDemo] of sources) (isDemo ? demoKeys : liveKeys).push(key);
  demoKeys.sort();
  liveKeys.sort();

  // Snapshot stabil: useSyncExternalStore compara prin identitate, deci
  // returnam acelasi obiect daca nimic nu s-a schimbat.
  if (
    snapshot.demoKeys.join() === demoKeys.join() &&
    snapshot.liveKeys.join() === liveKeys.join()
  ) {
    return;
  }

  snapshot = { isDemo: demoKeys.length > 0, demoKeys, liveKeys };
  for (const l of listeners) l();
}

export function markSource(key, isDemo) {
  if (sources.get(key) === isDemo) return;
  sources.set(key, isDemo);
  recompute();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

/** @returns {{ isDemo: boolean, demoKeys: string[], liveKeys: string[] }} */
export function useDataSourceStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Impacheteaza un fetcher astfel incat esecul sa cada pe date demo, dar sa
 * marcheze sursa. Inlocuieste `try { api() } catch { DEMO }` scris de mana.
 *
 * @param {string} key       cheia de query (aceeasi data lui useApiPolling)
 * @param {() => Promise<any>} fetcher
 * @param {any} demoValue
 */
export function demoFallback(key, fetcher, demoValue) {
  return async () => {
    try {
      const data = await fetcher();
      markSource(key, false);
      return data;
    } catch (err) {
      // Cadem pe date demo DOAR cand serverul e inaccesibil (status 0): asta e
      // cazul pentru care exista fallback-ul, dezvoltare fara backend pornit.
      //
      // O sesiune expirata (401) sau o eroare de server (500) nu inseamna
      // „arata cifre inventate" — ar ascunde problema reala in spatele unor
      // numere plauzibile. Le lasam sa iasa la suprafata.
      if (err?.status !== 0) {
        markSource(key, false);
        throw err;
      }
      markSource(key, true);
      return demoValue;
    }
  };
}
