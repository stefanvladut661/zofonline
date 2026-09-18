/**
 * Citirea si validarea exportului JSON din DorSoft.
 *
 * Exportul e un array de randuri; un rand = un articol de pe un document.
 * Toate valorile vin ca TEXT (inclusiv numerele), de-aia le convertim aici,
 * o singura data, cu mesaje de eroare care spun exact randul si coloana.
 *
 * WHITELIST STRICT: citim DOAR coloanele de mai jos. Daca DorSoft va exporta
 * vreodata si alte coloane (nume client, telefon, CNP, dioptrii), ele nu ajung
 * in niciun obiect din acest program — deci nici pe server.
 */

export const COLUMNS = [
  'TransHeaderRecNo', // id intern al documentului (creste monoton)
  'NrDoc',            // numarul de bon — cheia de idempotenta ceruta de server
  'DataDoc',          // "MM/DD/YY HH:mm:ss", ora locala a magazinului
  'TotalCuTVA',       // totalul documentului, memorat de DorSoft; GOL la documentele de marfa
  'Incasare',         // cat s-a incasat pe document; GOL cand Ridicata = 0
  'Ridicata',         // "1" = comanda ridicata de client, "0" = neridicata (sau anulata — neconfirmat)
  'ArticolRecNo',     // id intern al articolului, unic DOAR in baza acelei locatii
  'Cantitate',
  'Pret',             // cu TVA; NEGATIV = linie de discount
  'Denumire',
];

export class ParseError extends Error {}

/**
 * Bytes -> text. Acceptam UTF-8 (cu sau fara BOM) si UTF-16 cu BOM (Windows
 * le produce pe amandoua). Orice altceva (ANSI / Windows-1250) e REFUZAT:
 * altfel „Ramă" ar ajunge pe server ca „RamÄƒ" sau cu semne de intrebare.
 */
export function decodeExport(buf, fileName = 'export') {
  let enc = 'utf-8';
  if (buf[0] === 0xff && buf[1] === 0xfe) enc = 'utf-16le';
  else if (buf[0] === 0xfe && buf[1] === 0xff) enc = 'utf-16be';
  try {
    return new TextDecoder(enc, { fatal: true }).decode(buf); // BOM-ul e eliminat automat
  } catch {
    throw new ParseError(
      `${fileName}: fisierul nu e in UTF-8 (probabil ANSI / Windows-1250). ` +
      'Salveaza exportul ca UTF-8 — altfel diacriticele din denumiri ajung corupte pe server.',
    );
  }
}

/** Citeste array-ul JSON si verifica ca are forma asteptata si coloanele obligatorii. */
export function parseExport(json, fileName = 'export') {
  let rows;
  try {
    rows = JSON.parse(typeof json === 'string' ? json.replace(/^\uFEFF/, '') : decodeExport(json, fileName));
  } catch (err) {
    if (err instanceof ParseError) throw err;
    throw new ParseError(`${fileName}: nu e un JSON valid (${err.message})`);
  }
  if (!Array.isArray(rows)) throw new ParseError(`${fileName}: ma asteptam la o lista de randuri, nu la ${rows === null ? 'null' : typeof rows}`);
  if (rows.length === 0) throw new ParseError(`${fileName}: fisierul e gol (0 randuri)`);

  // Coloanele: obligatoriile trebuie sa existe pe primul rand; orice coloana
  // straina, de pe orice rand, e doar raportata — nu e citita niciodata.
  const found = Object.keys(rows[0] ?? {});
  const missing = COLUMNS.filter((c) => !found.includes(c));
  if (missing.length) {
    throw new ParseError(
      `${fileName}: lipsesc coloanele ${missing.join(', ')}. Coloane gasite: ${found.join(', ')}. ` +
      'Exportul DorSoft s-a schimbat? Verifica setarile de export.',
    );
  }
  const extra = new Set();
  for (const raw of rows) {
    if (raw && typeof raw === 'object') for (const k of Object.keys(raw)) if (!COLUMNS.includes(k)) extra.add(k);
  }

  return {
    rows: rows.map((raw, i) => pickRow(raw, i, fileName)),
    ignoredColumns: [...extra].sort(),
  };
}

/** Copiaza DOAR coloanele din whitelist, ca text curat. */
function pickRow(raw, index, fileName) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ParseError(`${fileName}: randul ${index + 1} nu e un obiect`);
  const row = { _index: index + 1 };
  for (const c of COLUMNS) {
    const v = Object.prototype.hasOwnProperty.call(raw, c) ? raw[c] : null;
    row[c] = v == null ? '' : (typeof v === 'object' ? '' : String(v));
  }
  return row;
}

/** "1097" -> 1097, "349.5" -> 349.5, "" -> null. Virgula zecimala e acceptata defensiv. */
export function toNumber(text, where) {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) throw new ParseError(`${where}: valoare numerica invalida "${text}"`);
  return n;
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/;

/**
 * "09/15/26 12:11:16" -> componente. Format AMERICAN (luna/zi/an), confirmat pe
 * date reale: prima grupa nu trece niciodata de 12, a doua ajunge la 31.
 * Validam oricum luna <= 12 si ziua reala din calendar: daca vreodata exportul
 * vine zi/luna, cadem zgomotos in loc sa inregistram vanzari in lunile gresite.
 */
export function parseDorsoftDate(text, where, { now = new Date() } = {}) {
  const m = DATE_RE.exec(String(text ?? '').trim());
  if (!m) throw new ParseError(`${where}: data "${text}" nu are formatul asteptat MM/DD/YY HH:mm:ss`);
  const [, mm, dd, yy, hh, mi, ss] = m.map(Number);
  if (mm < 1 || mm > 12) {
    throw new ParseError(`${where}: luna ${mm} e imposibila in "${text}" — exportul nu mai e in format MM/DD/YY?`);
  }
  const year = yy < 100 ? 2000 + yy : yy;
  const probe = new Date(Date.UTC(year, mm - 1, dd, hh, mi, ss));
  const validDay = probe.getUTCMonth() === mm - 1 && probe.getUTCDate() === dd;
  if (dd < 1 || !validDay || hh > 23 || mi > 59 || ss > 59) throw new ParseError(`${where}: data "${text}" nu exista in calendar`);
  const maxYear = now.getUTCFullYear() + 1;
  if (year < 2000 || year > maxYear) throw new ParseError(`${where}: anul ${year} din "${text}" nu e plauzibil (astept 2000..${maxYear})`);
  return { year, month: mm, day: dd, hour: hh, minute: mi, second: ss };
}

/** Toate datele dintr-un fisier au acelasi format: daca UNA e gresita, nu trimitem nimic din el. */
export function assertAllDatesParse(rows, fileName) {
  const bad = [];
  for (const r of rows) {
    try { parseDorsoftDate(r.DataDoc, `randul ${r._index}`); }
    catch (err) { bad.push(err.message); }
  }
  if (bad.length) {
    throw new ParseError(
      `${fileName}: ${bad.length} ${bad.length === 1 ? 'data invalida' : 'date invalide'} — nu trimit nimic din acest fisier. ` +
      `Prima: ${bad[0]}` + (bad.length > 1 ? ` (si inca ${bad.length - 1})` : ''),
    );
  }
}

/**
 * Ora locala a magazinului -> ISO 8601 in UTC (ce cere serverul).
 * Fara biblioteci: Intl stie offsetul zonei (inclusiv ora de vara) la orice moment.
 */
export function localToIso(parts, timeZone) {
  const { year, month, day, hour, minute, second } = parts;
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess - tzOffsetMs(guess, timeZone);
  // Corectie in jurul schimbarii orei: offsetul poate diferi intre prima si a doua estimare.
  const check = guess - tzOffsetMs(utc, timeZone);
  if (check !== utc) utc = check;
  return new Date(utc).toISOString();
}

const tzFormatters = new Map();
function tzOffsetMs(utcMs, timeZone) {
  let fmt = tzFormatters.get(timeZone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch {
      throw new ParseError(`Fus orar necunoscut: "${timeZone}" (ex. corect: Europe/Bucharest)`);
    }
    tzFormatters.set(timeZone, fmt);
  }
  const p = {};
  for (const part of fmt.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - utcMs;
}

/** "YYYY-MM-DD" local, pentru afisare in raport (nu pentru server). */
export function localDateKey({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Curata o denumire pentru afisare: spatii la capete, spatii duble. Cheia ramane id-ul, nu numele. */
export function cleanName(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** Forma normalizata pentru clasificare: fara diacritice, litere mici. */
export function normalizeName(text) {
  return cleanName(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
