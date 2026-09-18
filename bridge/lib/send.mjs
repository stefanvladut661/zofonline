/**
 * Semnarea si trimiterea catre server — contractul din server/README.md §3 si §4.
 *
 * Regula de aur: semnatura se calculeaza pe EXACT bytes trimisi. Serializam
 * o singura data (`serializeBody`) si acelasi sir merge si in HMAC, si pe fir.
 * (--dry-run scrie acelasi obiect, doar indentat ca sa fie lizibil.)
 */

import crypto from 'node:crypto';
import util from 'node:util';

export const INGEST_LIMIT = 5000; // maximul serverului per lista per cerere

/** Eroare de trimitere pe intelesul omului; `retryable` spune daca are rost sa reincerce. */
export class SendError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

/** O singura serializare, fara spatii — identic la dry-run si la trimitere. */
export function serializeBody(payload) {
  return JSON.stringify(payload);
}

/** HMAC-SHA256(api_key, "{timestamp}.{corp_brut}") in hex. */
export function sign({ apiKey, timestamp, body }) {
  return crypto.createHmac('sha256', apiKey).update(`${timestamp}.${body}`).digest('hex');
}

export function signedHeaders({ apiKey, connectorId, body, now = new Date() }) {
  const timestamp = now.toISOString();
  return {
    'Content-Type': 'application/json',
    'X-Connector-Id': connectorId,
    'X-Timestamp': timestamp,
    'X-Signature': sign({ apiKey, timestamp, body }),
  };
}

/**
 * Imparte payload-ul in cereri de maximum INGEST_LIMIT inregistrari per lista.
 * Vanzarile se taie DOAR intre bonuri (receipt_ref), niciodata in mijlocul
 * unui bon: fiecare cerere e atomica pe server, deci un bon nu ramane pe
 * jumatate daca a doua cerere pica. Produsele merg in prima cerere, iar
 * watermark-ul doar cu ULTIMA — serverul il avanseaza numai dupa ce datele
 * au intrat, deci nu-l marcam "trimis" inainte sa fie tot trimis.
 */
export function chunkPayload(payload) {
  const products = payload.products ?? [];
  const sales = payload.sales ?? [];

  // Grupuri de linii consecutive cu acelasi bon.
  const groups = [];
  for (const s of sales) {
    const last = groups[groups.length - 1];
    if (last && s.receipt_ref != null && last[0].receipt_ref === s.receipt_ref) last.push(s);
    else groups.push([s]);
  }
  const saleChunks = [];
  let current = [];
  for (const g of groups) {
    if (g.length > INGEST_LIMIT) throw new SendError(`Bonul ${g[0].receipt_ref} are ${g.length} linii, peste limita serverului de ${INGEST_LIMIT}`);
    if (current.length + g.length > INGEST_LIMIT) { saleChunks.push(current); current = []; }
    current.push(...g);
  }
  if (current.length) saleChunks.push(current);

  const productChunks = [];
  for (let i = 0; i < products.length; i += INGEST_LIMIT) productChunks.push(products.slice(i, i + INGEST_LIMIT));

  const n = Math.max(saleChunks.length, productChunks.length, 1);
  const chunks = [];
  for (let i = 0; i < n; i++) {
    const c = { agent_version: payload.agent_version };
    if (productChunks[i]?.length) c.products = productChunks[i];
    if (saleChunks[i]?.length) c.sales = saleChunks[i];
    if (i === n - 1 && payload.watermark) c.watermark = payload.watermark;
    chunks.push(c);
  }
  return chunks;
}

/**
 * Trimite un corp deja serializat. Intoarce { ok, status, data, raw | error }.
 * Nu arunca la erori HTTP — cel care apeleaza decide ce inseamna fiecare cod.
 * Redirect-urile NU sunt urmate: semnatura si corpul nu trebuie sa ajunga la
 * alt host decat cel din ZOF_SERVER_URL.
 */
export async function postSigned({ serverUrl, path, apiKey, connectorId, body, fetchImpl = fetch, timeoutMs = 30_000 }) {
  const headers = signedHeaders({ apiKey, connectorId, body });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${serverUrl}${path}`, { method: 'POST', headers, body, signal: controller.signal, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: res.status, redirectTo: res.headers.get('location'), data: null, raw: '' };
    }
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    return { ok: res.ok, status: res.status, data, raw };
  } catch (err) {
    if (process.env.ZOF_DEBUG) console.error(util.inspect(err, { depth: 5 }));
    const cause = err.cause?.code ?? err.cause?.message ?? '';
    const detail = err.name === 'AbortError' ? `timeout dupa ${timeoutMs / 1000}s` : [err.message, cause].filter(Boolean).join(' — ');
    return { ok: false, status: 0, error: detail, data: null, raw: '' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Raspunsul serverului -> ori { accepted, duplicates }, ori SendError explicata.
 * `expected` = cate inregistrari erau in cerere; serverul garanteaza ca
 * accepted.sales + duplicates = sales trimise, deci orice altceva inseamna ca
 * nu vorbim cu /api/ingest-ul real.
 */
export function interpretResponse(res, { url = '', expected = {} } = {}) {
  const rawDetail = res.data?.error ?? res.error ?? (res.raw ? res.raw.slice(0, 200) : `HTTP ${res.status}`);
  const detail = typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);
  if (res.status === 0) {
    throw new SendError(`Serverul nu a putut fi contactat (${detail}). Verifica ZOF_SERVER_URL si conexiunea la internet.`, { retryable: true });
  }
  if (res.status >= 300 && res.status < 400) {
    throw new SendError(`Serverul redirectioneaza ${url} catre ${res.redirectTo ?? '?'} (HTTP ${res.status}). Pune in ZOF_SERVER_URL adresa finala (de obicei cu https://).`, { status: res.status });
  }
  if (res.status === 400) throw new SendError(`Serverul a RESPINS datele ca invalide: ${detail}. Nimic din aceasta cerere nu a fost scris. Nu reincerca pana nu se corecteaza.`, { status: 400 });
  if (res.status === 401) throw new SendError(`Autentificare esuata: ${detail}. Verifica ZOF_CONNECTOR_ID_*/ZOF_API_KEY_* (create pe serverul din ZOF_SERVER_URL) si ceasul calculatorului (diferenta maxima 5 minute).`, { status: 401 });
  if (res.status === 404) throw new SendError(`Serverul a raspuns 404 la ${url}. ZOF_SERVER_URL e gresit sau serverul nu expune /api/ingest.`, { status: 404 });
  if (res.status === 413) throw new SendError('Cererea e prea mare pentru server.', { status: 413 });
  if (res.status === 429 || res.status >= 500) {
    throw new SendError(`Eroare de server (HTTP ${res.status}): ${detail}. Poti reincerca mai tarziu — retrimiterea e sigura (idempotenta).`, { status: res.status, retryable: true });
  }
  if (!res.ok) throw new SendError(`Serverul a refuzat cererea (HTTP ${res.status}): ${detail}. Verifica ZOF_SERVER_URL si configurarea.`, { status: res.status });

  const d = res.data;
  if (!d || typeof d !== 'object' || d.ok !== true || !d.accepted || typeof d.accepted !== 'object') {
    throw new SendError(`Raspuns neasteptat de la ${url} (HTTP ${res.status}): "${(res.raw || '').slice(0, 200)}". Nu pare a fi serverul Zof — verifica ZOF_SERVER_URL.`, { status: res.status });
  }
  const accepted = { products: Number(d.accepted.products ?? 0), sales: Number(d.accepted.sales ?? 0) };
  const duplicates = Number(d.duplicates ?? 0);
  if (![accepted.products, accepted.sales, duplicates].every(Number.isInteger)) {
    throw new SendError(`Raspuns neasteptat de la ${url}: contoarele nu sunt numere ("${(res.raw || '').slice(0, 200)}").`, { status: res.status });
  }
  if (expected.products != null && accepted.products !== expected.products) {
    throw new SendError(`Serverul confirma ${accepted.products} produse, dar am trimis ${expected.products}. Raspunsul nu e consistent — verifica ZOF_SERVER_URL.`, { status: res.status });
  }
  if (expected.sales != null && accepted.sales + duplicates !== expected.sales) {
    throw new SendError(
      `Serverul confirma ${accepted.sales} vanzari noi + ${duplicates} existente, dar am trimis ${expected.sales}. ` +
      'Raspunsul nu e consistent — verifica ca ZOF_SERVER_URL e serverul Zof corect.',
      { status: res.status },
    );
  }
  return { accepted, duplicates };
}
