#!/usr/bin/env node
/**
 * Puntea DorSoft -> server Zof.
 *
 * Citeste un export JSON din DorSoft (un fisier = o locatie), aplica regulile
 * din lib/rules.mjs, construieste products + sales (fara inventory) si:
 *   --dry-run  scrie payload-ul si raportul in fisiere, NU trimite nimic
 *   --send     semneaza HMAC si trimite pe POST /api/ingest
 *
 * Nu atinge niciodata DorSoft: citeste doar fisierul de export.
 *
 *   node dorsoft-bridge.mjs --dry-run ../generated-json/ZOF-Centru-001.json
 *   node dorsoft-bridge.mjs --send    ../generated-json/ZOF-Centru-001.json
 *
 * Configurarea se citeste din bridge/.env (vezi env.example), indiferent din
 * ce folder e pornita comanda.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Versiunea de Node: mai jos de 20 lipsesc fetch stabil, node:test si TextDecoder fatal.
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
if (NODE_MAJOR < 20) {
  console.error(`Node.js ${process.versions.node} e prea vechi pentru punte: e nevoie de Node 20 sau mai nou (recomandat LTS de pe nodejs.org).`);
  process.exit(2);
}

const { loadDotEnv, parseFileLocations, locationForFile, credentialsFor, timeZone, exportRowCap, ConfigError } = await import('./lib/config.mjs');
loadDotEnv(path.join(here, '.env'));

const { parseExport, ParseError } = await import('./lib/parse.mjs');
const { transform, buildPayload } = await import('./lib/rules.mjs');
const { renderReport, renderSummaryLine } = await import('./lib/report.mjs');
const { serializeBody, chunkPayload, postSigned, interpretResponse, SendError } = await import('./lib/send.mjs');

const USAGE = `
Puntea DorSoft -> Zof

  node dorsoft-bridge.mjs --dry-run <fisier.json> [alt fisier ...]   verifica, scrie payload + raport, NU trimite
  node dorsoft-bridge.mjs --send    <fisier.json> [alt fisier ...]   trimite pe server (semnat HMAC)

Optiuni:
  --location <nume>   forteaza locatia (altfel se deduce din numele fisierului, vezi ZOF_FILE_LOCATIONS)
  --out <folder>      unde se scriu payload-ul si raportul (implicit: bridge/out)
  --quiet             afiseaza doar sumarul, nu raportul intreg

Configurarea (server, connector, chei) se citeste din bridge/.env — vezi env.example.
Coduri de iesire: 0 = totul in regula, 1 = trimiterea a esuat / eroare neasteptata, 2 = fisier sau configurare gresita.
`.trim();

function parseArgs(argv) {
  const opts = { dryRun: false, send: false, quiet: false, location: null, out: path.join(here, 'out'), files: [] };
  const value = (flag, i) => {
    const v = argv[i + 1];
    if (v == null || v.trim() === '' || v.startsWith('--')) throw new ConfigError(`Optiunea ${flag} are nevoie de o valoare`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--send') opts.send = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--location') opts.location = value(a, i++);
    else if (a === '--out') opts.out = path.resolve(value(a, i++));
    else if (a === '--help' || a === '-h') return { help: true };
    else if (a.startsWith('--')) throw new ConfigError(`Optiune necunoscuta: ${a}`);
    else opts.files.push(a);
  }
  return opts;
}

async function processFile(filePath, opts) {
  const fileName = path.basename(filePath);
  const stem = fileName.replace(/\.json$/i, '');
  const { rows, ignoredColumns } = parseExport(fs.readFileSync(filePath), fileName);

  // Momentul in care DorSoft a scris exportul (mtime). Serverul il retine si
  // dashboard-ul il afiseaza ca „date din <data>" — nu „Live", pentru ca
  // exportul ruleaza a doua zi si cifrele nu sunt niciodata de acum.
  const sourceFile = { name: fileName, mtime: fs.statSync(filePath).mtime };

  const pairs = parseFileLocations();
  const location = locationForFile(filePath, pairs, opts.location);
  if (opts.location) {
    let byName = null;
    try { byName = locationForFile(filePath, pairs); } catch { /* prefix necunoscut — --location e exact pentru cazul asta */ }
    if (byName && byName !== location) console.warn(`ATENTIE: ${fileName} arata a "${byName}" dupa nume, dar --location spune "${location}".`);
  }

  const result = transform({ rows, location, timeZone: timeZone(), fileName, ignoredColumns, exportRowCap: exportRowCap() });
  const payload = buildPayload({ ...result, sourceFile });
  const { report } = result;
  report.sourceFile = sourceFile;

  // Payload-ul si raportul se pastreaza si la trimitere, ca urma de audit.
  // La --send raportul e rescris dupa trimitere, cu rezultatul real.
  fs.mkdirSync(opts.out, { recursive: true });
  const payloadPath = path.join(opts.out, `${stem}.payload.json`);
  const reportPath = path.join(opts.out, `${stem}.raport.txt`);
  fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2)); // indentat ca sa fie citit; la trimitere se serializeaza compact
  const saveReport = (extra = {}) => fs.writeFileSync(reportPath, renderReport(report, { dryRun: opts.dryRun, payloadPath, ...extra }));
  saveReport();
  if (!opts.quiet) console.log(renderReport(report, { dryRun: opts.dryRun, payloadPath }));

  if (!report.reconciliation.ok) {
    saveReport({ status: 'failed', outcome: 'reconciliere esuata — nu s-a trimis' });
    throw new Error(`${fileName}: reconcilierea a esuat (trimis ${report.reconciliation.sent} vs DorSoft ${report.reconciliation.dorsoft}). Nu trimit.`);
  }

  if (opts.send) {
    if (!payload.sales) {
      console.log(`${fileName}: nimic de trimis (0 bonuri incluse).`);
      saveReport({ status: 'sent', outcome: 'nimic de trimis (0 bonuri incluse)' });
      return report;
    }
    const lines = [];
    try {
      const creds = credentialsFor(location);
      const chunks = chunkPayload(payload);
      const url = `${creds.serverUrl}/api/ingest`;
      console.log(`\nTrimit ${fileName} -> ${url} ca "${creds.connectorId}" (${chunks.length} ${chunks.length === 1 ? 'cerere' : 'cereri'})`);
      for (const [i, chunk] of chunks.entries()) {
        const body = serializeBody(chunk);
        const res = await postSigned({ ...creds, path: '/api/ingest', body });
        let outcome;
        try {
          outcome = interpretResponse(res, { url, expected: { sales: chunk.sales?.length ?? 0, products: chunk.products?.length ?? 0 } });
        } catch (err) {
          if (err instanceof SendError && i > 0) err.message += ` (cererile 1-${i} au intrat deja; retrimiterea fisierului e sigura)`;
          throw err;
        }
        const line = `cererea ${i + 1}/${chunks.length}: OK — server a acceptat products=${outcome.accepted.products} sales=${outcome.accepted.sales}, ` +
          `vanzari deja existente (ignorate): ${outcome.duplicates}`;
        lines.push(line);
        console.log('  ' + line);
      }
      console.log('  Gata. Retrimiterea aceluiasi fisier e sigura: serverul ignora bonurile deja primite.');
      saveReport({ status: 'sent', outcome: lines.join(' | ') });
    } catch (err) {
      saveReport({ status: 'failed', outcome: [...lines, `EROARE: ${err.message}`].join(' | ') });
      throw err;
    }
  }
  return report;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message, '\n\n' + USAGE);
    return 2;
  }
  if (opts.help) { console.log(USAGE); return 0; }
  if (opts.dryRun === opts.send) {
    console.error(opts.dryRun ? 'Alege ori --dry-run, ori --send, nu ambele.' : 'Trebuie sa spui explicit --dry-run sau --send.', '\n\n' + USAGE);
    return 2;
  }
  if (!opts.files.length) { console.error('Niciun fisier dat.\n\n' + USAGE); return 2; }
  if (opts.location && opts.files.length > 1) {
    console.error('--location merge cu un singur fisier (altfel ai trimite fisiere diferite la aceeasi locatie).');
    return 2;
  }

  // Fisierele sunt independente (fiecare = alta locatie, alt connector): unul
  // gresit nu opreste restul. Sumarul spune la final ce a mers si ce nu.
  const results = [];
  for (const f of opts.files) {
    const name = path.basename(f);
    if (!fs.existsSync(f)) {
      console.error(`\nEROARE la ${name}: fisierul nu exista (${f})`);
      results.push({ name, error: 'fisierul nu exista', code: 2 });
      continue;
    }
    try {
      results.push({ name, report: await processFile(f, opts) });
    } catch (err) {
      const isConfig = err instanceof ParseError || err instanceof ConfigError;
      const isSend = err instanceof SendError;
      const label = isConfig ? '' : isSend ? '(trimitere) ' : '(neasteptata) ';
      console.error(`\nEROARE ${label}la ${name}: ${err.message}`);
      if (!isConfig && !isSend && process.env.ZOF_DEBUG) console.error(err.stack);
      results.push({ name, error: err.message, code: isConfig ? 2 : 1 });
    }
  }

  console.log('\nSUMAR');
  for (const r of results) console.log('  ' + (r.report ? renderSummaryLine(r.report) : `${r.name}: ESUAT — ${r.error}`));
  if (opts.dryRun) console.log(`\nNimic nu a fost trimis. Payload-urile si rapoartele sunt in: ${opts.out}`);
  const failed = results.filter((r) => r.error);
  if (!failed.length) return 0;
  return failed.some((r) => r.code === 2) ? 2 : 1;
}

process.exitCode = await main();
