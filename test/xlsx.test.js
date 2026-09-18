/**
 * Verifica fisierul .xlsx generat fara dependinte: structura de zip (antete,
 * CRC-uri, directorul central), fisierele XML obligatorii si continutul foii —
 * numerele trebuie sa ramana numere, textul sa fie escapat, diacriticele intacte.
 */
import { toXlsx, zipStored, crc32, columnLetter } from '@/lib/xlsx';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

/** Cititor minimal de zip „stored”: intoarce { nume -> { data, crcOk } }. */
function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const entries = {};
  let pos = 0;
  while (dv.getUint32(pos, true) === 0x04034b50) {
    const method = dv.getUint16(pos + 8, true);
    const crc = dv.getUint32(pos + 14, true);
    const size = dv.getUint32(pos + 18, true);
    const nameLen = dv.getUint16(pos + 26, true);
    const extraLen = dv.getUint16(pos + 28, true);
    const name = dec.decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const start = pos + 30 + nameLen + extraLen;
    const data = bytes.subarray(start, start + size);
    entries[name] = { data, text: dec.decode(data), method, crcOk: crc32(data) === crc };
    pos = start + size;
  }
  const centralStart = pos;
  let count = 0;
  while (dv.getUint32(pos, true) === 0x02014b50) {
    count++;
    const nameLen = dv.getUint16(pos + 28, true);
    const extraLen = dv.getUint16(pos + 30, true);
    const commentLen = dv.getUint16(pos + 32, true);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  const eocd = dv.getUint32(pos, true) === 0x06054b50
    ? { entries: dv.getUint16(pos + 10, true), centralOffset: dv.getUint32(pos + 16, true) }
    : null;
  return { entries, centralCount: count, centralStart, eocd, end: pos + 22 };
}

console.log('\n--- CRC32 si litere de coloana ---');
ok('crc32("123456789") = cbf43926', crc32(new TextEncoder().encode('123456789')).toString(16) === 'cbf43926');
ok('crc32 pe sir gol = 0', crc32(new Uint8Array(0)) === 0);
ok('A, Z, AA, AB, ZZ, AAA', ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA'].every((l, i) => columnLetter([0, 25, 26, 27, 701, 702][i]) === l),
  [0, 25, 26, 27, 701, 702].map(columnLetter).join(','));

console.log('\n--- Zip stored ---');
const z = readZip(zipStored([
  { name: 'a.txt', data: new TextEncoder().encode('salut') },
  { name: 'dir/b.txt', data: new TextEncoder().encode('ă î ș ț') },
]));
ok('doua intrari locale', Object.keys(z.entries).length === 2);
ok('directorul central are doua intrari', z.centralCount === 2 && z.eocd?.entries === 2);
ok('EOCD indica inceputul directorului central', z.eocd?.centralOffset === z.centralStart);
ok('metoda stored (0)', Object.values(z.entries).every((e) => e.method === 0));
ok('CRC-urile corespund', Object.values(z.entries).every((e) => e.crcOk));
ok('continutul UTF-8 e intact', z.entries['dir/b.txt'].text === 'ă î ș ț');

console.log('\n--- XLSX: structura ---');
const columns = [
  { key: 'sku', label: 'SKU' },
  { key: 'name', label: 'Produs' },
  { key: 'qty', label: 'Cantitate' },
  { key: 'value', label: 'Valoare (RON)' },
  { key: 'total', label: 'Total', map: (r) => r.qty * r.value },
];
const rows = [
  { sku: 'RB-3025', name: 'Ramă bărbați Argeș', qty: 2, value: 1290 },
  { sku: 'A&B <"x">', name: '  cu spații  ', qty: 1, value: 890.5 },
  { sku: 'C', name: null, qty: 0, value: undefined },
  { sku: 'D', name: 'controlchar', qty: true, value: NaN },
];
const xlsx = toXlsx(columns, rows, { sheetName: 'Raport vânzări: [test]/*?', now: new Date('2026-09-18T10:00:00Z') });
const x = readZip(xlsx);
ok('e un zip valid, citit pana la capat', x.eocd !== null && x.end === xlsx.length);
ok('toate CRC-urile corespund', Object.values(x.entries).every((e) => e.crcOk));
for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'docProps/core.xml', 'docProps/app.xml']) {
  ok(`contine ${part}`, part in x.entries);
}
ok('fiecare parte e declarata in [Content_Types]', ['/xl/workbook.xml', '/xl/worksheets/sheet1.xml', '/xl/styles.xml', '/docProps/core.xml', '/docProps/app.xml']
  .every((p) => x.entries['[Content_Types].xml'].text.includes(`PartName="${p}"`)));
ok('XML-urile incep cu declaratia', Object.entries(x.entries).filter(([n]) => n.endsWith('.xml') || n.endsWith('.rels'))
  .every(([, e]) => e.text.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')));

console.log('\n--- XLSX: foaia ---');
const sheet = x.entries['xl/worksheets/sheet1.xml'].text;
const wb = x.entries['xl/workbook.xml'].text;
ok('numele foii e curatat de caractere interzise si taiat la 31',
  wb.includes('<sheet name="Raport vânzări   test" sheetId="1"'), wb.match(/<sheet name="[^"]*"/)?.[0]);
ok('antetul are stilul bold (s="1")', sheet.includes('<c r="A1" s="1" t="inlineStr"><is><t>SKU</t></is></c>'));
ok('diacriticele raman intacte', sheet.includes('<t>Ramă bărbați Argeș</t>'));
ok('numerele sunt celule numerice, nu text', sheet.includes('<c r="C2"><v>2</v></c>') && sheet.includes('<c r="D3"><v>890.5</v></c>'));
ok('coloanele calculate (map) sunt aplicate', sheet.includes('<c r="E2"><v>2580</v></c>'));
ok('& < > " sunt escapate', sheet.includes('<t>A&amp;B &lt;&quot;x&quot;&gt;</t>'));
ok('spatiile de la capete sunt pastrate', sheet.includes('<t xml:space="preserve">  cu spații  </t>'));
ok('null/undefined nu produc celule', !sheet.includes('r="B4"') && !sheet.includes('r="D4"'));
ok('zero ramane celula numerica', sheet.includes('<c r="C4"><v>0</v></c>'));
ok('boolean devine celula booleana', sheet.includes('<c r="C5" t="b"><v>1</v></c>'));
ok('NaN nu produce celula', !sheet.includes('r="D5"'));
ok('caracterele de control sunt eliminate', sheet.includes('<t>controlchar</t>'));
ok('dimensiunea acopera tot tabelul', sheet.includes('<dimension ref="A1:E5"/>'));
ok('antetul e inghetat si are filtru', sheet.includes('state="frozen"') && sheet.includes('<autoFilter ref="A1:E5"/>'));
ok('filtrul e inregistrat in workbook', wb.includes("_xlnm._FilterDatabase") && wb.includes("!$A$1:$E$5"));
ok('are latimi de coloana', /<col min="1" max="1" width="\d+" customWidth="1"\/>/.test(sheet));

console.log('\n--- XLSX: fara randuri ---');
const empty = readZip(toXlsx(columns, []));
ok('tabel gol -> fisier valid, doar antet', empty.entries['xl/worksheets/sheet1.xml'].text.includes('<dimension ref="A1:E1"/>'));

console.log('\n' + '='.repeat(40) + `\n  ${pass} trecute, ${fail} esuate\n` + '='.repeat(40));
if (fail) process.exitCode = 1;
