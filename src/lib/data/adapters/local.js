/**
 * Adaptor de persistenta pe localStorage.
 *
 * Rol: tine aplicatia functionala si testabila cat timp backend-ul central
 * (plan.md §5.2) nu exista inca. Implementeaza acelasi contract ca httpAdapter,
 * deci cand backend-ul e gata se schimba o singura linie in src/lib/data/index.js.
 *
 * LIMITE, asumate explicit:
 *  - datele traiesc doar in browserul curent, nu sunt partajate intre useri;
 *  - nu e sursa de adevar pentru stoc/vanzari si nu va deveni;
 *  - potrivit doar pentru config (AppSettings) si pentru dezvoltarea ecranelor
 *    de connectori inainte sa existe serverul.
 */

const PREFIX = 'zof:data:';

function read(entity) {
  try {
    const raw = localStorage.getItem(PREFIX + entity);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`[data/local] Nu pot citi "${entity}" din localStorage:`, err);
    return [];
  }
}

function write(entity, records) {
  try {
    localStorage.setItem(PREFIX + entity, JSON.stringify(records));
  } catch (err) {
    // Quota depasita sau storage blocat (mod privat). Fail loud — plan.md §7.7.
    throw new Error(`[data/local] Scriere esuata pentru "${entity}": ${err.message}`);
  }
}

/** Sortare in stil `'-camp'` (descrescator) / `'camp'` (crescator). */
export function sortRecords(records, sort) {
  if (!sort) return records;
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;

  return [...records].sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    const cmp = av < bv ? -1 : 1;
    return desc ? -cmp : cmp;
  });
}

/** Potrivire pe egalitate stricta pentru fiecare cheie din `where`. */
export function matchRecord(record, where) {
  return Object.entries(where || {}).every(([k, v]) => record?.[k] === v);
}

export function createLocalAdapter() {
  return {
    name: 'local',

    async list(entity, { sort, limit } = {}) {
      const out = sortRecords(read(entity), sort);
      return limit ? out.slice(0, limit) : out;
    },

    async filter(entity, where, { sort, limit } = {}) {
      const out = sortRecords(
        read(entity).filter((r) => matchRecord(r, where)),
        sort,
      );
      return limit ? out.slice(0, limit) : out;
    },

    async get(entity, id) {
      return read(entity).find((r) => r.id === id) ?? null;
    },

    async create(entity, record) {
      const records = read(entity);
      records.push(record);
      write(entity, records);
      return record;
    },

    async update(entity, id, patch) {
      const records = read(entity);
      const i = records.findIndex((r) => r.id === id);
      if (i === -1) throw new Error(`[data/local] ${entity} cu id="${id}" nu exista`);
      records[i] = { ...records[i], ...patch };
      write(entity, records);
      return records[i];
    },

    async remove(entity, id) {
      const records = read(entity);
      const next = records.filter((r) => r.id !== id);
      if (next.length === records.length) {
        throw new Error(`[data/local] ${entity} cu id="${id}" nu exista`);
      }
      write(entity, next);
      return { id };
    },
  };
}
