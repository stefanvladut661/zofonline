/**
 * Configurarea vine EXCLUSIV din variabile de mediu — fisierul .env de langa
 * script (bridge/.env), citit de loadDotEnv() indiferent din ce folder pornesti
 * comanda. Nimic hardcodat: nici URL, nici connector, nici chei.
 *
 *   ZOF_SERVER_URL              https://api.exemplu.ro
 *   ZOF_FILE_LOCATIONS          ZOF-Centru=centru,ZOF-Exercitiu=exercitiu
 *   ZOF_CONNECTOR_ID_<LOCATIE>  pc-centru-1        (o pereche per locatie)
 *   ZOF_API_KEY_<LOCATIE>       cheia afisata o singura data la connector:add
 *   ZOF_TIMEZONE                Europe/Bucharest   (optional)
 *   ZOF_EXPORT_ROW_CAP          1000               (optional; 0 = dezactivat)
 *
 * Pentru --dry-run sunt necesare doar ZOF_FILE_LOCATIONS (are un implicit) si,
 * optional, ZOF_TIMEZONE. Serverul si cheile intra in joc doar la --send.
 */

import fs from 'node:fs';
import path from 'node:path';

export class ConfigError extends Error {}

const DEFAULT_FILE_LOCATIONS = 'ZOF-Centru=centru,ZOF-Exercitiu=exercitiu';

/**
 * Incarca un fisier .env in process.env (KEY=VALUE, # comentarii, ghilimele
 * optionale). Variabilele deja setate in mediu au prioritate. Lipsa fisierului
 * nu e o eroare — la dry-run nu e nevoie de el.
 */
export function loadDotEnv(file, env = process.env) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return false; }
  // Notepad poate salva .env ca "Unicode" (UTF-16): recunoastem BOM-ul ca la export.
  const enc = buf[0] === 0xff && buf[1] === 0xfe ? 'utf-16le' : buf[0] === 0xfe && buf[1] === 0xff ? 'utf-16be' : 'utf-8';
  const text = new TextDecoder(enc).decode(buf);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = /^"([^"]*)"|^'([^']*)'/.exec(value); // ghilimele + eventual comentariu dupa ele
    if (quoted) value = quoted[1] ?? quoted[2];
    else value = value.replace(/\s+#.*$/, '').trim(); // comentariu la finalul liniei
    if (!(m[1] in env)) env[m[1]] = value;
  }
  return true;
}

/** "ZOF-Centru=centru,ZOF-Exercitiu=exercitiu" -> [{ prefix, location }] */
export function parseFileLocations(text = process.env.ZOF_FILE_LOCATIONS) {
  const raw = (text ?? '').trim() || DEFAULT_FILE_LOCATIONS;
  return raw.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [prefix, location] = p.split('=').map((s) => (s ?? '').trim());
    if (!prefix || !location) throw new ConfigError(`ZOF_FILE_LOCATIONS: perechea "${p}" nu are forma Prefix=locatie`);
    return { prefix, location: location.toLowerCase() };
  });
}

/**
 * Locatia unui fisier, dupa prefixul numelui. Castiga cel mai LUNG prefix care
 * se potriveste si dupa care nu urmeaza litera/cifra — "ZOF-Centru-Mall-001"
 * nu e "ZOF-Centru". Un fisier trimis la locatia gresita ar amesteca datele.
 */
export function locationForFile(filePath, pairs = parseFileLocations(), override = null) {
  if (override) {
    const loc = String(override).trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(loc)) throw new ConfigError(`--location "${override}" e invalid: doar litere mici, cifre, - si _`);
    return loc;
  }
  const base = path.basename(filePath).toLowerCase();
  // Dupa prefix acceptam doar un contor / sufix numeric si extensia: "-001.json",
  // "-001 (2).json", ".json". Orice litera in plus ("-mall") inseamna alta locatie,
  // pe care nu o ghicim.
  const REST = /^(?:[-_ .]*\(?\d+\)?)*[-_ .]*\.json$/i;
  const hit = pairs
    .filter((p) => {
      const pre = p.prefix.toLowerCase();
      return base.startsWith(pre) && REST.test(base.slice(pre.length));
    })
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!hit) {
    throw new ConfigError(
      `Nu stiu ce locatie e fisierul "${path.basename(filePath)}". ` +
      `Prefixe cunoscute: ${pairs.map((p) => `${p.prefix} -> ${p.location}`).join(', ')}. ` +
      'Adauga-l in ZOF_FILE_LOCATIONS sau da --location <nume>.',
    );
  }
  return hit.location;
}

/** Numele sufixului de variabila pentru o locatie: "centru-2" -> "CENTRU_2". */
export function envSuffix(location) {
  return String(location).toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/** Datele de conectare ale unei locatii. Cheia nu e niciodata afisata sau logata. */
export function credentialsFor(location, env = process.env) {
  const key = envSuffix(location);
  const serverUrl = (env.ZOF_SERVER_URL ?? '').trim();
  const connectorId = (env[`ZOF_CONNECTOR_ID_${key}`] ?? '').trim();
  const apiKey = (env[`ZOF_API_KEY_${key}`] ?? '').trim();
  const missing = [];
  if (!serverUrl) missing.push('ZOF_SERVER_URL');
  if (!connectorId) missing.push(`ZOF_CONNECTOR_ID_${key}`);
  if (!apiKey) missing.push(`ZOF_API_KEY_${key}`);
  if (missing.length) {
    throw new ConfigError(`Pentru trimitere reala lipsesc din .env: ${missing.join(', ')}`);
  }
  if (!/^https?:\/\//.test(serverUrl)) throw new ConfigError(`ZOF_SERVER_URL trebuie sa inceapa cu http:// sau https:// (acum: "${serverUrl}")`);
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  if (/\/api$/i.test(cleanUrl)) throw new ConfigError(`ZOF_SERVER_URL nu trebuie sa contina /api la final (acum: "${serverUrl}") — puntea adauga singura /api/ingest`);
  // Cheile arata ca "zof_<connector>_<hex>"; daca connector-ul arata asa, au fost inversate
  // in .env si am afisa cheia pe ecran / am trimite-o ca header in clar.
  if (/^zof_.+_[0-9a-f]{32,}$/i.test(connectorId)) {
    throw new ConfigError(`ZOF_CONNECTOR_ID_${key} pare a fi cheia API, nu id-ul agentului — verifica daca le-ai inversat in .env`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(connectorId)) throw new ConfigError(`ZOF_CONNECTOR_ID_${key} contine caractere nepermise (doar litere, cifre, - si _)`);
  return { serverUrl: cleanUrl, connectorId, apiKey };
}

export function timeZone(env = process.env) {
  return (env.ZOF_TIMEZONE ?? '').trim() || 'Europe/Bucharest';
}

export function exportRowCap(env = process.env) {
  const raw = (env.ZOF_EXPORT_ROW_CAP ?? '').trim();
  if (raw === '') return undefined; // implicitul din rules.mjs
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new ConfigError(`ZOF_EXPORT_ROW_CAP trebuie sa fie un numar intreg >= 0 (acum: "${raw}")`);
  return n;
}
