/**
 * Testele puntii: regulile pe un export sintetic, semnarea, impartirea in
 * transe si un test cap-coada peste serverul REAL (pornit in acelasi proces,
 * cu baza in memorie) — inclusiv idempotenta la retrimitere.
 *
 *   node --test "bridge/test/*.test.mjs"    (sau `npm test` din bridge/)
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { parseExport, parseDorsoftDate, localToIso, decodeExport, ParseError, COLUMNS } from '../lib/parse.mjs';
import { transform, buildPayload, categorize } from '../lib/rules.mjs';
import { renderReport } from '../lib/report.mjs';
import { parseFileLocations, locationForFile, credentialsFor, loadDotEnv, ConfigError } from '../lib/config.mjs';
import { serializeBody, sign, chunkPayload, postSigned, interpretResponse, SendError } from '../lib/send.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(here, '..', 'dorsoft-bridge.mjs');

// ─── Export sintetic care acopera fiecare regula ────────────────────────────

let th = 100;
function doc({ nrDoc, date, total, incasare = total, ridicata = '1' }, lines) {
  th++;
  return lines.map(([articol, qty, pret, denumire]) => ({
    TransHeaderRecNo: String(th), NrDoc: String(nrDoc), DataDoc: date,
    TotalCuTVA: total, Incasare: incasare, Ridicata: ridicata,
    ArticolRecNo: String(articol), Cantitate: String(qty), Pret: String(pret), Denumire: denumire,
    NumeClient: 'Popescu Ion', // coloana in plus — NU trebuie sa ajunga nicaieri
  }));
}

const LENS = 'Lentile RHEIN VISION Single Vision 1.6';
const FIXTURE = [
  // A: bon normal cu pereche de lentile, rama, manopera, discount
  ...doc({ nrDoc: 100, date: '09/14/26 15:45:37', total: '2000' }, [
    [9349, 1, 1097, LENS], [9349, 1, 1097, LENS], [2003, 1, 359, 'Ramă 2003 C12'], [468, 1, 30, ' manopera rama'], [5888, 1, -583, 'DISCOUNT.'],
  ]),
  // B: comanda neridicata (Ridicata 0, Incasare goala) — inclusa, marcata
  ...doc({ nrDoc: 101, date: '09/15/26 10:00:00', total: '250', incasare: '', ridicata: '0' }, [
    [5840, 1, 122, 'Lentile RHEIN VISION Organic 1.56'], [5840, 1, 122, 'Lentile RHEIN VISION Organic 1.56'], [468, 1, 30, ' manopera rama'], [5888, 1, -24, 'DISCOUNT.'],
  ]),
  // C: document de marfa (TotalCuTVA gol) — exclus
  ...doc({ nrDoc: 4350, date: '09/11/26 00:00:00', total: '', incasare: '', ridicata: '0' }, [
    [9400, 2, 360, 'Ramă ST280 C3'], [9401, 1, 500, 'Ramă RH228 C205'],
  ]),
  // D: bon taiat (suma liniilor 446 != 400) — sarit
  ...doc({ nrDoc: 99, date: '07/01/26 17:02:49', total: '400' }, [
    [5173, 1, 208, 'Lentile RHEIN VISION Organic 1'], [5173, 1, 208, 'Lentile RHEIN VISION Organic 1'], [468, 1, 30, ' manopera rama'],
  ]),
  // E: "Diverse servicii" — inclus, raportat separat
  ...doc({ nrDoc: 102, date: '09/16/26 12:00:00', total: '3694.22', incasare: '', ridicata: '0' }, [
    [1195, 1, 3664.22, 'Diverse servicii'], [468, 1, 30, ' manopera rama'],
  ]),
  // F: acelasi articol la doua preturi pe acelasi bon -> sufix -2
  ...doc({ nrDoc: 103, date: '09/17/26 12:00:00', total: '60' }, [
    [468, 1, 30, ' manopera rama'], [468, 1, 20, ' manopera rama'], [7535, 1, 10, 'SNUR NEGRU 0510 10'],
  ]),
  // G: cantitate negativa (retur) — inclus, raportat
  ...doc({ nrDoc: 104, date: '09/17/26 13:00:00', total: '-359' }, [[2003, -1, 359, 'Ramă 2003 C12']]),
  // H: iarna (UTC+2), ca sa verificam ora de vara/iarna
  ...doc({ nrDoc: 105, date: '01/15/26 10:00:00', total: '10' }, [[7535, 1, 10, 'SNUR NEGRU 0510 10']]),
];
const FIXTURE_JSON = JSON.stringify(FIXTURE);

describe('parse', () => {
  test('citeste doar coloanele din whitelist si raporteaza restul', () => {
    const { rows, ignoredColumns } = parseExport(FIXTURE_JSON, 'f.json');
    assert.equal(rows.length, FIXTURE.length);
    assert.deepEqual(ignoredColumns, ['NumeClient']);
    assert.deepEqual(Object.keys(rows[0]).filter((k) => k !== '_index'), COLUMNS);
    assert.ok(!('NumeClient' in rows[0]));
  });

  test('cade zgomotos cand lipsesc coloane', () => {
    const bad = JSON.stringify([{ NrDoc: '1', Pret: '2' }]);
    assert.throws(() => parseExport(bad, 'f.json'), (e) => e instanceof ParseError && /lipsesc coloanele/.test(e.message));
    assert.throws(() => parseExport('[]', 'f.json'), /gol/);
    assert.throws(() => parseExport('{}', 'f.json'), /lista/);
  });

  test('data e MM/DD/YY si refuza luni, zile si ani imposibili', () => {
    assert.deepEqual(parseDorsoftDate('09/15/26 12:11:16', 'x'), { year: 2026, month: 9, day: 15, hour: 12, minute: 11, second: 16 });
    assert.throws(() => parseDorsoftDate('15/09/26 12:11:16', 'x'), /luna 15 e imposibila/);
    assert.throws(() => parseDorsoftDate('2026-09-15', 'x'), /formatul asteptat/);
    assert.throws(() => parseDorsoftDate('02/30/26 10:00:00', 'x'), /nu exista in calendar/);
    assert.throws(() => parseDorsoftDate('02/29/26 10:00:00', 'x'), /nu exista in calendar/); // 2026 nu e bisect
    assert.throws(() => parseDorsoftDate('09/15/99 10:00:00', 'x', { now: new Date('2026-09-18') }), /anul 2099/);
  });

  test('UTF-8 cu/fara BOM si UTF-16 merg; ANSI/Windows-1250 e refuzat', () => {
    const text = JSON.stringify([{ ...FIXTURE[0], Denumire: 'Ramă test' }]);
    const utf8 = Buffer.from(text, 'utf8');
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8]);
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    for (const buf of [utf8, bom, utf16]) {
      assert.equal(parseExport(buf, 'f.json').rows[0].Denumire, 'Ramă test');
    }
    const cp1250 = Buffer.from(text.replace('ă', '\xe3'), 'latin1'); // ă in Windows-1250 = 0xE3
    assert.throws(() => decodeExport(cp1250, 'f.json'), /nu e in UTF-8/);
    assert.throws(() => parseExport(cp1250, 'f.json'), /nu e in UTF-8/);
    assert.throws(() => parseExport('null', 'f.json'), /nu la null/);
  });

  test('o singura data invalida in fisier opreste tot fisierul', () => {
    const rows = parseExport(JSON.stringify([...FIXTURE, { ...FIXTURE[0], NrDoc: '999', DataDoc: '15/09/26 10:00:00' }]), 'f.json').rows;
    assert.throws(() => transform({ rows, location: 'centru', fileName: 'f.json' }), (e) => e instanceof ParseError && /nu trimit nimic din acest fisier/.test(e.message) && /luna 15/.test(e.message));
  });

  test('ora locala -> UTC, cu ora de vara si de iarna', () => {
    const tz = 'Europe/Bucharest';
    assert.equal(localToIso({ year: 2026, month: 7, day: 3, hour: 11, minute: 6, second: 1 }, tz), '2026-07-03T08:06:01.000Z'); // EEST +3
    assert.equal(localToIso({ year: 2026, month: 1, day: 15, hour: 10, minute: 0, second: 0 }, tz), '2026-01-15T08:00:00.000Z'); // EET +2
    assert.throws(() => localToIso({ year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, 'Nu/Exista'), /Fus orar/);
  });
});

describe('reguli', () => {
  const { rows, ignoredColumns } = parseExport(FIXTURE_JSON, 'ZOF-Centru-001.json');
  const result = transform({ rows, location: 'centru', fileName: 'ZOF-Centru-001.json', ignoredColumns });
  const { sales, products, report } = result;
  const bySrc = Object.fromEntries(sales.map((s) => [s.source_ref, s]));

  test('R1: perechea de lentile se insumeaza, nu se sterge', () => {
    assert.equal(bySrc['100-9349'].quantity, 2);
    assert.equal(bySrc['100-9349'].unit_price, 1097);
    assert.equal(report.merged.lines, 2); // A si B
  });

  test('R2: discount = un singur SKU pe locatie, pret negativ, total = TotalCuTVA', () => {
    assert.equal(bySrc['100-discount'].sku, 'centru-discount');
    assert.equal(bySrc['100-discount'].unit_price, -583);
    const totalA = sales.filter((s) => s.receipt_ref === '100').reduce((t, s) => t + s.quantity * s.unit_price, 0);
    assert.equal(Math.round(totalA * 100) / 100, 2000);
    const discount = products.find((p) => p.sku === 'centru-discount');
    assert.equal(discount.category, 'discount');
    assert.deepEqual(discount.attributes.articole_dorsoft, ['5888']);
    assert.equal(report.discount.lines, 2);
  });

  test('R3: serviciile raman in vanzari si au categoria servicii', () => {
    assert.equal(bySrc['100-468'].unit_price, 30);
    assert.equal(products.find((p) => p.sku === 'centru-468').category, 'servicii');
    assert.equal(products.find((p) => p.sku === 'centru-468').name, 'manopera rama'); // curatat de spatii
    assert.equal(categorize('Consultatie oftalmologica', 150), 'servicii');
    assert.equal(categorize('Ramă X', 100), 'rame');
    assert.equal(categorize('Lentile Y', 100), 'lentile');
    assert.equal(categorize('8684 C20', 129), null); // nu ghicim
  });

  test('R4/R5: SKU = locatie-ArticolRecNo, source_ref = NrDoc-ArticolRecNo, receipt_ref = NrDoc', () => {
    assert.equal(bySrc['100-2003'].sku, 'centru-2003');
    assert.equal(bySrc['100-2003'].receipt_ref, '100');
    assert.ok(sales.every((s) => s.channel === 'fizic'));
    assert.ok(sales.every((s) => /^centru-/.test(s.sku)));
  });

  test('R6: fara inventory in payload', () => {
    const payload = buildPayload(result);
    assert.ok(!('inventory' in payload));
    assert.equal(payload.watermark, [...sales.map((s) => s.sold_at)].sort().at(-1)); // cel mai nou bon trimis
    assert.equal(payload.agent_version, 'dorsoft-json-bridge/1.0.0');
  });

  test('N1: Ridicata=0 e inclus si marcat', () => {
    assert.ok(bySrc['101-5840']);
    assert.deepEqual(report.flagged.openOrders.map((d) => d.nrDoc), ['101', '102']);
  });

  test('N2: documentul de marfa e exclus si raportat', () => {
    assert.ok(!sales.some((s) => s.receipt_ref === '4350'));
    assert.equal(report.excluded.stockDocs.length, 1);
    assert.equal(report.excluded.stockDocs[0].nrDoc, '4350');
    assert.equal(report.excluded.stockDocs[0].lineSum, 1220);
  });

  test('N3: bonul taiat e sarit si raportat cu diferenta', () => {
    assert.ok(!sales.some((s) => s.receipt_ref === '99'));
    assert.deepEqual(report.excluded.mismatched.map((d) => [d.nrDoc, d.lineSum, d.total, d.diff]), [['99', 446, 400, 46]]);
  });

  test('N4: Diverse servicii e inclus si raportat separat', () => {
    assert.equal(bySrc['102-1195'].unit_price, 3664.22);
    assert.deepEqual(report.flagged.diverseServicii.map((d) => d.nrDoc), ['102']);
  });

  test('acelasi articol la preturi diferite -> sufix -2, ambele linii pastrate', () => {
    assert.equal(bySrc['103-468'].unit_price, 30);
    assert.equal(bySrc['103-468-2'].unit_price, 20);
    assert.deepEqual(report.flagged.repeatedArticle, [{ nrDoc: '103', sku: 'centru-468', prices: [30, 20] }]);
  });

  test('cantitatea negativa trece si e raportata; vanzarea si returul ei raman linii separate', () => {
    assert.equal(bySrc['104-2003'].quantity, -1);
    assert.equal(report.flagged.nonPositiveQty.length, 1);
    const r2 = transform({ rows: parseExport(JSON.stringify(doc({ nrDoc: 200, date: '09/17/26 13:00:00', total: '0' }, [[2003, 1, 359, 'Ramă'], [2003, -1, 359, 'Ramă']])), 'f.json').rows, location: 'centru' });
    assert.deepEqual(r2.sales.map((s) => [s.source_ref, s.quantity]), [['200-2003', 1], ['200-2003-2', -1]]);
    assert.equal(r2.report.reconciliation.ok, true);
    assert.equal(r2.report.flagged.repeatedArticle.length, 0); // acelasi pret — nu e "pret diferit"
    assert.equal(r2.report.flagged.nonPositiveQty.length, 1);
  });

  test('NrDoc gol -> randurile sunt excluse si raportate, nu trimise cu source_ref "-art"', () => {
    const rows = parseExport(JSON.stringify([...doc({ nrDoc: '', date: '09/17/26 13:00:00', total: '10' }, [[7535, 1, 10, 'SNUR']]), ...doc({ nrDoc: 300, date: '09/17/26 13:00:00', total: '10' }, [[7535, 1, 10, 'SNUR']])]), 'f.json').rows;
    const r = transform({ rows, location: 'centru' });
    assert.equal(r.sales.length, 1);
    assert.equal(r.sales[0].source_ref, '300-7535');
    assert.match(r.report.excluded.invalid[0].reason, /fara NrDoc/);
  });

  test('acelasi NrDoc pe doua documente diferite -> ambele excluse, cu motiv clar', () => {
    const rows = parseExport(JSON.stringify([...doc({ nrDoc: 400, date: '09/17/26 13:00:00', total: '10' }, [[7535, 1, 10, 'SNUR']]), ...doc({ nrDoc: 400, date: '09/16/26 13:00:00', total: '20' }, [[7535, 2, 10, 'SNUR']])]), 'f.json').rows;
    const r = transform({ rows, location: 'centru' });
    assert.equal(r.sales.length, 0);
    assert.match(r.report.excluded.invalid[0].reason, /acelasi NrDoc pe documente diferite/);
  });

  test('fisier plin (limita exportului): cel mai vechi document e sarit chiar daca suma iese', () => {
    const full = [...doc({ nrDoc: 501, date: '09/17/26 13:00:00', total: '10' }, [[7535, 1, 10, 'SNUR']]), ...doc({ nrDoc: 500, date: '09/16/26 13:00:00', total: '20' }, [[7535, 2, 10, 'SNUR']])];
    const rows = parseExport(JSON.stringify(full), 'f.json').rows;
    const r = transform({ rows, location: 'centru', exportRowCap: 2 });
    assert.deepEqual(r.sales.map((s) => s.receipt_ref), ['501']);
    assert.equal(r.report.excluded.mismatched[0].nrDoc, '500');
    assert.equal(r.report.excluded.mismatched[0].atEdge, true);
    assert.equal(r.report.exportFull, true);
    const r0 = transform({ rows, location: 'centru', exportRowCap: 0 });
    assert.equal(r0.sales.length, 2);
    // mai multe randuri decat limita configurata: limita e gresita, nu sarim nimic, dar avertizam
    const rOver = transform({ rows, location: 'centru', exportRowCap: 1 });
    assert.equal(rOver.sales.length, 2);
    assert.equal(rOver.report.exportFull, false);
    assert.equal(rOver.report.exportOverCap, 1);
    assert.match(renderReport(rOver.report, { dryRun: true }), /peste ZOF_EXPORT_ROW_CAP=1/);
  });

  test('linia de discount fara ArticolRecNo e acceptata; denumirea goala devine null', () => {
    const rows = parseExport(JSON.stringify(doc({ nrDoc: 600, date: '09/17/26 13:00:00', total: '5' }, [[7535, 1, 10, '   '], ['', 1, -5, 'red']])), 'f.json').rows;
    const r = transform({ rows, location: 'centru' });
    assert.equal(r.sales.length, 2);
    assert.equal(r.products.find((p) => p.sku === 'centru-7535').name, null);
    assert.equal(r.products.find((p) => p.sku === 'centru-7535').attributes.denumire_dorsoft, null);
    assert.equal(r.report.reconciliation.ok, true);
  });

  test('reconcilierea iese la ban si numerele din raport sunt corecte', () => {
    assert.equal(report.included.receipts, 6);
    assert.equal(report.documents, 8);
    assert.equal(sales.length, 14);
    assert.equal(report.reconciliation.ok, true);
    assert.equal(report.reconciliation.dorsoft, Math.round((2000 + 250 + 3694.22 + 60 - 359 + 10) * 100) / 100);
    assert.equal(report.reconciliation.sent, report.reconciliation.dorsoft);
  });

  test('datele sunt in UTC si vanzarile sunt cronologice', () => {
    assert.equal(bySrc['100-9349'].sold_at, '2026-09-14T12:45:37.000Z');
    assert.equal(bySrc['105-7535'].sold_at, '2026-01-15T08:00:00.000Z');
    const dates = sales.map((s) => s.sold_at);
    assert.deepEqual(dates, [...dates].sort());
  });

  test('nimic din coloanele straine nu ajunge in payload', () => {
    const body = serializeBody(buildPayload(result));
    assert.ok(!body.includes('Popescu'));
    assert.ok(!body.includes('NumeClient'));
    assert.deepEqual(report.ignoredColumns, ['NumeClient']);
  });

  test('raportul e lizibil si contine sectiunile cheie', () => {
    const text = renderReport(report, { dryRun: true, payloadPath: 'x.json' });
    for (const s of ['DRY-RUN', 'RECONCILIERE', 'OK — identice la ban', 'doc 4350', 'bon 99', 'bon 101', 'Diverse servicii', 'centru-discount', 'NumeClient', 'Perioada:  2026-01-15 … 2026-09-17']) {
      assert.ok(text.includes(s), `raportul nu contine "${s}"`);
    }
  });

  test('locatia invalida e refuzata', () => {
    assert.throws(() => transform({ rows, location: 'Centru Mall' }), /Locatie invalida/);
  });
});

describe('config', () => {
  test('locatia se deduce din prefixul numelui de fisier', () => {
    const pairs = parseFileLocations('ZOF-Centru=centru, ZOF-Exercitiu=exercitiu');
    assert.equal(locationForFile('C:/x/ZOF-Centru-001.json', pairs), 'centru');
    assert.equal(locationForFile('zof-exercitiu-007.JSON', pairs), 'exercitiu');
    assert.equal(locationForFile('altceva.json', pairs, 'Mall'), 'mall');
    assert.throws(() => locationForFile('altceva.json', pairs), (e) => e instanceof ConfigError && /ZOF_FILE_LOCATIONS/.test(e.message));
    assert.throws(() => parseFileLocations('fara-egal'), /Prefix=locatie/);
    // cel mai lung prefix castiga, indiferent de ordine, si prefixul trebuie sa se termine la o granita
    const nested = parseFileLocations('ZOF-Centru=centru,ZOF-Centru-Mall=mall');
    assert.equal(locationForFile('ZOF-Centru-Mall-001.json', nested), 'mall');
    assert.equal(locationForFile('ZOF-Centru-001.json', nested), 'centru');
    assert.equal(locationForFile('ZOF-Centru-001 (2).json', nested), 'centru');
    assert.equal(locationForFile('ZOF-Centru.json', nested), 'centru');
    assert.throws(() => locationForFile('ZOF-CentruX-001.json', nested), /Nu stiu ce locatie/);
    // un sufix cu litere e alta locatie, neconfigurata — nu o ghicim
    assert.throws(() => locationForFile('ZOF-Centru-Nou-001.json', pairs), /Nu stiu ce locatie/);
    assert.throws(() => locationForFile('x.json', pairs, 'Centru Mall'), /--location "Centru Mall" e invalid/);
    const catchAll = parseFileLocations('ZOF=centru,ZOF-Exercitiu=exercitiu');
    assert.equal(locationForFile('ZOF-Exercitiu-001.json', catchAll), 'exercitiu');
    assert.equal(locationForFile('ZOF-001.json', catchAll), 'centru');
  });

  test('.env de langa script se incarca fara sa suprascrie mediul', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zof-env-'));
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, '\uFEFF# comentariu\nZOF_SERVER_URL=https://a.ro # nota\nZOF_API_KEY_CENTRU="zof_pc_abc" # dupa ghilimele\nexport ZOF_TIMEZONE=\'Europe/Bucharest\'\nGRESIT\n');
    const env = { ZOF_SERVER_URL: 'https://deja.ro' };
    assert.equal(loadDotEnv(file, env), true);
    assert.deepEqual(env, { ZOF_SERVER_URL: 'https://deja.ro', ZOF_API_KEY_CENTRU: 'zof_pc_abc', ZOF_TIMEZONE: 'Europe/Bucharest' });
    assert.equal(loadDotEnv(path.join(dir, 'nu-exista'), env), false);
    // .env salvat de Notepad ca "Unicode" (UTF-16 LE cu BOM)
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ZOF_SERVER_URL=https://c.ro\r\n', 'utf16le')]));
    const env16 = {};
    loadDotEnv(file, env16);
    assert.deepEqual(env16, { ZOF_SERVER_URL: 'https://c.ro' });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('connector-ul si cheia inversate sau /api in URL sunt prinse inainte de trimitere', () => {
    const base = { ZOF_SERVER_URL: 'https://api.x.ro', ZOF_API_KEY_CENTRU: 'k' };
    assert.throws(() => credentialsFor('centru', { ...base, ZOF_CONNECTOR_ID_CENTRU: 'zof_pc-centru-1_' + 'a'.repeat(48) }), /pare a fi cheia API/);
    assert.throws(() => credentialsFor('centru', { ...base, ZOF_CONNECTOR_ID_CENTRU: 'pc centru' }), /caractere nepermise/);
    assert.throws(() => credentialsFor('centru', { ...base, ZOF_SERVER_URL: 'https://api.x.ro/api', ZOF_CONNECTOR_ID_CENTRU: 'pc-1' }), /nu trebuie sa contina \/api/);
  });

  test('credentialele vin din env, per locatie, cu mesaj clar cand lipsesc', () => {
    assert.throws(() => credentialsFor('centru', {}), /ZOF_SERVER_URL, ZOF_CONNECTOR_ID_CENTRU, ZOF_API_KEY_CENTRU/);
    const c = credentialsFor('centru', { ZOF_SERVER_URL: 'https://api.x.ro/', ZOF_CONNECTOR_ID_CENTRU: 'pc-1', ZOF_API_KEY_CENTRU: 'k' });
    assert.deepEqual(c, { serverUrl: 'https://api.x.ro', connectorId: 'pc-1', apiKey: 'k' });
    assert.throws(() => credentialsFor('centru', { ZOF_SERVER_URL: 'api.x.ro', ZOF_CONNECTOR_ID_CENTRU: 'pc-1', ZOF_API_KEY_CENTRU: 'k' }), /http/);
  });
});

describe('semnare si transe', () => {
  test('semnatura e HMAC-SHA256 pe "{timestamp}.{corp}" — identic cu serverul', async () => {
    const { signPayload } = await import('../../server/lib/crypto.js');
    const body = serializeBody({ a: 1 });
    const ts = '2026-09-17T10:00:00.000Z';
    assert.equal(sign({ apiKey: 'secret', timestamp: ts, body }), signPayload('secret', ts, body));
    assert.equal(sign({ apiKey: 'secret', timestamp: ts, body }), crypto.createHmac('sha256', 'secret').update(`${ts}.${body}`).digest('hex'));
  });

  test('peste 5000 de linii se imparte DOAR intre bonuri; produsele in prima, watermark in ultima', () => {
    // 4000 de bonuri a cate 3 linii = 12000 de linii; 5000 nu e multiplu de 3, deci taietura cade intre bonuri
    const sales = Array.from({ length: 12_000 }, (_, i) => ({ i, receipt_ref: String(Math.floor(i / 3)) }));
    const products = Array.from({ length: 10 }, (_, i) => ({ i }));
    const chunks = chunkPayload({ agent_version: 'v', watermark: 'w', products, sales });
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].products.length, 10);
    assert.ok(!chunks[1].products && !chunks[2].products);
    assert.deepEqual(chunks.map((c) => c.sales.length), [4998, 4998, 2004]);
    for (let i = 0; i < chunks.length - 1; i++) {
      const last = chunks[i].sales.at(-1).receipt_ref, first = chunks[i + 1].sales[0].receipt_ref;
      assert.notEqual(last, first, 'un bon a fost taiat intre doua cereri');
    }
    assert.deepEqual(chunks.map((c) => c.watermark), [undefined, undefined, 'w']);
    assert.equal(chunkPayload({ agent_version: 'v', products, sales: [] }).length, 1);
    assert.throws(() => chunkPayload({ agent_version: 'v', sales: Array.from({ length: 5001 }, () => ({ receipt_ref: 'x' })) }), /peste limita/);
  });

  test('data fisierului de export merge in payload si, la transe, doar in ultima (ca watermark-ul)', () => {
    const mtime = new Date('2026-09-17T06:12:33.000Z');
    const payload = buildPayload({ products: [{ sku: 'a' }], sales: [{ receipt_ref: '1' }], watermark: 'w', sourceFile: { name: 'ZOF-Centru-001.json', mtime } });
    assert.equal(payload.source_file_name, 'ZOF-Centru-001.json');
    assert.equal(payload.source_file_mtime, '2026-09-17T06:12:33.000Z');
    assert.ok(!('source_file_mtime' in buildPayload({ products: [], sales: [], watermark: null })), 'fara fisier, fara camp');

    const sales = Array.from({ length: 12_000 }, (_, i) => ({ i, receipt_ref: String(Math.floor(i / 3)) }));
    const chunks = chunkPayload({ ...payload, sales });
    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks.map((c) => c.source_file_mtime), [undefined, undefined, '2026-09-17T06:12:33.000Z']);
    assert.deepEqual(chunks.map((c) => c.source_file_name), [undefined, undefined, 'ZOF-Centru-001.json']);
  });

  test('raspunsurile serverului sunt explicate pe intelesul omului si validate', () => {
    const t = (res, opts) => { try { interpretResponse(res, opts); return null; } catch (e) { assert.ok(e instanceof SendError); return e.message; } };
    assert.match(t({ ok: false, status: 401, data: { error: 'x' } }), /ceasul/);
    assert.match(t({ ok: false, status: 400, data: { error: 'sales[1].sold_at' } }), /sales\[1\]\.sold_at/);
    assert.match(t({ ok: false, status: 0, error: 'fetch failed — ENOTFOUND' }), /ENOTFOUND.*ZOF_SERVER_URL/);
    assert.match(t({ ok: false, status: 404, raw: '' }, { url: 'https://x/api/api/ingest' }), /404 la https:\/\/x\/api\/api\/ingest/);
    assert.match(t({ ok: false, status: 301, redirectTo: 'https://alt/' }), /redirectioneaza .* https:\/\/alt/);
    assert.match(t({ ok: false, status: 503, raw: 'busy' }), /reincerca mai tarziu/);
    assert.match(t({ ok: true, status: 200, data: null, raw: '<html>' }), /Nu pare a fi serverul Zof/);
    assert.match(t({ ok: true, status: 200, data: { ok: true, accepted: { sales: 1 }, duplicates: 0 }, raw: '' }, { expected: { sales: 5 } }), /nu e consistent/);
    assert.match(t({ ok: true, status: 200, data: { ok: true, accepted: { products: 'abc', sales: 5 }, duplicates: 0 }, raw: '' }, { expected: { sales: 5 } }), /contoarele nu sunt numere/);
    assert.match(t({ ok: true, status: 200, data: { ok: true, accepted: { products: 1, sales: 5 }, duplicates: 0 }, raw: '' }, { expected: { sales: 5, products: 3 } }), /confirma 1 produse, dar am trimis 3/);
    assert.match(t({ ok: false, status: 400, data: { error: { code: 'x' } } }), /\{"code":"x"\}/);
    assert.deepEqual(interpretResponse({ ok: true, status: 200, data: { ok: true, accepted: { products: 2, sales: 3 }, duplicates: 2 }, raw: '' }, { expected: { sales: 5 } }), { accepted: { products: 2, sales: 3 }, duplicates: 2 });
  });
});

// ─── Cap-coada: serverul real, in acelasi proces, baza in memorie ───────────

describe('cap-coada peste serverul real', () => {
  let server, BASE, creds, tmpDir, fixturePath;

  before(async () => {
    process.env.ZOF_SECRET_KEY = crypto.randomBytes(32).toString('hex');
    process.env.ZOF_DB_FILE = ':memory:';
    process.env.ZOF_CORS_ORIGINS = 'http://localhost:5173';
    const { openDatabase } = await import('../../server/db/index.js');
    openDatabase();
    const { createServer } = await import('../../server/index.js');
    const { createLocation, createConnector } = await import('../../server/routes/admin.js');
    server = createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    BASE = `http://127.0.0.1:${server.address().port}`;
    const loc = createLocation({ id: 'loc-centru', name: 'Centru', type: 'fizic' });
    const { apiKey } = createConnector({ connector_id: 'pc-centru-1', location_id: loc.id, name: 'PC Centru' });
    creds = { serverUrl: BASE, connectorId: 'pc-centru-1', apiKey };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zof-bridge-'));
    fixturePath = path.join(tmpDir, 'ZOF-Centru-001.json');
    fs.writeFileSync(fixturePath, FIXTURE_JSON);
  });

  after(async () => {
    await new Promise((r) => server?.close(r));
    const { closeDatabase } = await import('../../server/db/index.js');
    closeDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('serverul accepta payload-ul semnat si retrimiterea e idempotenta', async () => {
    const { rows } = parseExport(FIXTURE_JSON, 'ZOF-Centru-001.json');
    const payload = buildPayload(transform({ rows, location: 'centru' }));
    const body = serializeBody(payload);

    const first = await postSigned({ ...creds, path: '/api/ingest', body });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.deepEqual(first.data.accepted, { products: payload.products.length, inventory: 0, sales: 14 });
    assert.equal(first.data.duplicates, 0);

    const again = await postSigned({ ...creds, path: '/api/ingest', body: serializeBody(payload) });
    assert.equal(again.status, 200);
    assert.equal(again.data.accepted.sales, 0);
    assert.equal(again.data.duplicates, 14);

    // Ce a ajuns in baza = exact suma TotalCuTVA a bonurilor incluse.
    const { get } = await import('../../server/db/index.js');
    const row = get('SELECT COUNT(*) AS n, ROUND(SUM(quantity * unit_price), 2) AS total FROM sales WHERE location_id = ?', 'loc-centru');
    assert.equal(row.n, 14);
    assert.equal(row.total, Math.round((2000 + 250 + 3694.22 + 60 - 359 + 10) * 100) / 100);
    assert.equal(get('SELECT COUNT(*) AS n FROM products').n, payload.products.length);
    assert.equal(get('SELECT COUNT(*) AS n FROM inventory').n, 0);
  });

  test('corpul modificat dupa semnare e respins (401)', async () => {
    const body = serializeBody({ agent_version: 'x', sales: [] });
    const headers = (await import('../lib/send.mjs')).signedHeaders({ ...creds, body });
    const res = await fetch(`${BASE}/api/ingest`, { method: 'POST', headers, body: body + ' ' });
    assert.equal(res.status, 401);
  });

  test('CLI: --dry-run nu trimite nimic si scrie payload + raport; --send trimite', async () => {
    const run = promisify(execFile);
    const outDir = path.join(tmpDir, 'out');
    const env = {
      ...process.env,
      ZOF_SERVER_URL: BASE, ZOF_CONNECTOR_ID_CENTRU: creds.connectorId, ZOF_API_KEY_CENTRU: creds.apiKey,
    };

    const { get } = await import('../../server/db/index.js');
    const before = get('SELECT COUNT(*) AS n FROM sales').n;
    const dry = await run(process.execPath, [BRIDGE, '--dry-run', fixturePath, '--out', outDir], { env });
    assert.match(dry.stdout, /nimic nu a fost trimis/i);
    assert.ok(fs.existsSync(path.join(outDir, 'ZOF-Centru-001.payload.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'ZOF-Centru-001.raport.txt')));
    assert.equal(get('SELECT COUNT(*) AS n FROM sales').n, before);

    // Data fisierului (mtime) ajunge pe server si devine „data din care sunt cifrele".
    const fileTime = new Date('2026-09-17T06:12:33.000Z');
    fs.utimesSync(fixturePath, fileTime, fileTime);
    const sent = await run(process.execPath, [BRIDGE, '--send', fixturePath, '--quiet', '--out', outDir], { env });
    assert.match(sent.stdout, /server a acceptat products=\d+ sales=0, vanzari deja existente \(ignorate\): 14/);
    assert.ok(!sent.stdout.includes(creds.apiKey), 'cheia API nu trebuie sa apara in output');
    assert.match(fs.readFileSync(path.join(outDir, 'ZOF-Centru-001.raport.txt'), 'utf8'), /TRIMITERE REALA — reusita[\s\S]*Rezultat:  cererea 1\/1: OK/);
    assert.match(fs.readFileSync(path.join(outDir, 'ZOF-Centru-001.raport.txt'), 'utf8'), /Exportat:  17\.09\.2026, 09:12:33/);
    const payloadOnDisk = JSON.parse(fs.readFileSync(path.join(outDir, 'ZOF-Centru-001.payload.json'), 'utf8'));
    assert.equal(payloadOnDisk.source_file_mtime, fileTime.toISOString());
    assert.equal(payloadOnDisk.source_file_name, 'ZOF-Centru-001.json');
    const state = get('SELECT data_as_of, data_source_file FROM sync_state WHERE connector_id = ?', 'pc-centru-1');
    assert.deepEqual({ ...state }, { data_as_of: fileTime.toISOString(), data_source_file: 'ZOF-Centru-001.json' });

    await assert.rejects(run(process.execPath, [BRIDGE, fixturePath], { env }), /explicit --dry-run sau --send/);
    await assert.rejects(run(process.execPath, [BRIDGE, '--dry-run', fixturePath, '--out'], { env }), /are nevoie de o valoare/);
    await assert.rejects(run(process.execPath, [BRIDGE, '--dry-run', fixturePath, '--out', ''], { env }), /are nevoie de o valoare/);
    await assert.rejects(run(process.execPath, [BRIDGE, '--dry-run', fixturePath, '--out', outDir, '--location', 'Centru Mall'], { env }), (e) => /--location "Centru Mall" e invalid/.test(e.stderr) && e.code === 2);
    await assert.rejects(run(process.execPath, [BRIDGE, '--send', fixturePath, '--out', outDir], { env: { ...env, ZOF_API_KEY_CENTRU: '' } }), (e) => {
      assert.match(e.stderr, /ZOF_API_KEY_CENTRU/);
      assert.match(fs.readFileSync(path.join(outDir, 'ZOF-Centru-001.raport.txt'), 'utf8'), /TRIMITERE REALA — ESUATA[\s\S]*Rezultat:  EROARE: Pentru trimitere reala lipsesc/);
      return true;
    });
    await assert.rejects(run(process.execPath, [BRIDGE, '--send', fixturePath, '--out', outDir], { env: { ...env, ZOF_API_KEY_CENTRU: 'gresita' } }), (e) => /Autentificare esuata/.test(e.stderr) && e.code === 1);
    await assert.rejects(run(process.execPath, [BRIDGE, '--send', fixturePath, '--out', outDir], { env: { ...env, ZOF_SERVER_URL: `${BASE}/api//` } }), (e) => /nu trebuie sa contina \/api/.test(e.stderr) && e.code === 2);

    // Mai multe fisiere: unul stricat nu opreste restul, iar sumarul spune tot.
    const badPath = path.join(tmpDir, 'ZOF-Exercitiu-001.json');
    fs.writeFileSync(badPath, '{"nu":"lista"}');
    await assert.rejects(run(process.execPath, [BRIDGE, '--dry-run', badPath, fixturePath, '--out', outDir, '--quiet'], { env }), (e) => {
      assert.equal(e.code, 2);
      assert.match(e.stdout, /ZOF-Exercitiu-001\.json: ESUAT/);
      assert.match(e.stdout, /ZOF-Centru-001\.json: 6 bonuri/);
      return true;
    });
  });

  test('CLI: --location contrar numelui avertizeaza; --send salveaza si el raportul', async () => {
    const run = promisify(execFile);
    const outDir = path.join(tmpDir, 'out2');
    const env = { ...process.env, ZOF_SERVER_URL: BASE, ZOF_CONNECTOR_ID_CENTRU: creds.connectorId, ZOF_API_KEY_CENTRU: creds.apiKey };
    const r = await run(process.execPath, [BRIDGE, '--send', fixturePath, '--location', 'centru', '--out', outDir, '--quiet'], { env });
    assert.ok(fs.existsSync(path.join(outDir, 'ZOF-Centru-001.raport.txt')));
    assert.match(fs.readFileSync(path.join(outDir, 'ZOF-Centru-001.raport.txt'), 'utf8'), /TRIMITERE REALA/);
    assert.equal(r.stderr.trim(), '');
    const other = path.join(tmpDir, 'ZOF-Exercitiu-002.json');
    fs.writeFileSync(other, FIXTURE_JSON);
    const w = await run(process.execPath, [BRIDGE, '--dry-run', other, '--location', 'centru', '--out', outDir, '--quiet'], { env });
    assert.match(w.stderr, /arata a "exercitiu" dupa nume, dar --location spune "centru"/);
  });
});
