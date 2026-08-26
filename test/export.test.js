/**
 * Verifica generarea CSV — in special cazurile care sparg Excel-ul in practica:
 * diacritice, separator in interiorul valorii, ghilimele, randuri noi.
 */
import { toCsv, formatDateTime, timestampSuffix } from '@/lib/export';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

const columns = [
  { key: 'sku', label: 'SKU' },
  { key: 'name', label: 'Produs' },
  { key: 'qty', label: 'Cantitate' },
  { key: 'value', label: 'Valoare' },
];

console.log('\n--- CSV: format de baza ---');
const csv = toCsv(columns, [
  { sku: 'RB-3025', name: 'Aviator Classic', qty: 2, value: 1290 },
  { sku: 'OA-8046', name: 'Holbrook', qty: 1, value: 890.5 },
]);
const lines = csv.split('\r\n');

ok('incepe cu BOM UTF-8', csv.charCodeAt(0) === 0xfeff);
ok('separatorul e ;', lines[0] === '﻿SKU;Produs;Cantitate;Valoare');
ok('foloseste CRLF', csv.includes('\r\n'));
ok('un rand per inregistrare', lines.length === 3);
ok('intregii raman intregi', lines[1].includes(';1290'));
ok('zecimalele au virgula', lines[2].includes('890,5'), lines[2]);

console.log('\n--- CSV: valori care sparg parserele ---');
const tricky = toCsv(columns, [
  { sku: 'A;1', name: 'Nume cu ; separator', qty: 1, value: 10 },
  { sku: 'B', name: 'Ochelari "Premium"', qty: 1, value: 20 },
  { sku: 'C', name: 'Linia 1\nLinia 2', qty: 1, value: 30 },
  { sku: 'D', name: 'Ramă bărbați Argeș', qty: 1, value: 40 },
  { sku: 'E', name: null, qty: 0, value: undefined },
]);
const t = tricky.split('\r\n');

ok('citeaza valorile cu separator', t[1].startsWith('"A;1";"Nume cu ; separator"'), t[1]);
ok('dubleaza ghilimelele', t[2].includes('"Ochelari ""Premium"""'), t[2]);
ok('citeaza valorile multi-linie', t[3].includes('"Linia 1\nLinia 2"'));
ok('pastreaza diacriticele', t[4].includes('Ramă bărbați Argeș'));
ok('null si undefined devin gol', t[5] === 'E;;0;', t[5]);

console.log('\n--- CSV: coloane calculate ---');
const mapped = toCsv(
  [{ key: 'total', label: 'Total', map: (r) => r.qty * r.price }],
  [{ qty: 3, price: 100 }],
);
ok('map() e aplicat', mapped.split('\r\n')[1] === '300');

console.log('\n--- Ajutoare ---');
ok('timestampSuffix e sortabil',
  /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(timestampSuffix(new Date('2026-08-26T14:05:00'))));
ok('formatDateTime accepta gol', formatDateTime(null) === '');
ok('formatDateTime lasa datele invalide neatinse', formatDateTime('nu-e-o-data') === 'nu-e-o-data');
ok('formatDateTime formateaza romaneste', formatDateTime('2026-08-26T14:05:00').includes('26'));

console.log('\n' + '='.repeat(40) + `\n  ${pass} trecute, ${fail} esuate\n` + '='.repeat(40));
if (fail) process.exitCode = 1;
