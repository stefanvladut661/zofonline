/**
 * Formatarea perioadelor si a datelor afisate pe dashboard: intervalele trebuie
 * sa fie scurte, dar niciodata ambigue, si sa nu alunece cu o zi din cauza UTC.
 */
import { formatDay, formatDateRange, formatDateTime, formatPercent } from '@/lib/format';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

console.log('\n--- formatDay ---');
ok('zi cu an', /^17 sept\.? 2026$/.test(formatDay('2026-09-17')), formatDay('2026-09-17'));
ok('zi fara an', /^17 sept\.?$/.test(formatDay('2026-09-17', { year: false })), formatDay('2026-09-17', { year: false }));
ok('prima zi a lunii nu aluneca in luna trecuta (UTC)', formatDay('2026-09-01').startsWith('1 sept'), formatDay('2026-09-01'));
ok('valoare goala -> sir gol', formatDay(null) === '' && formatDay(undefined) === '');
ok('format necunoscut ramane neatins', formatDay('ieri') === 'ieri');

console.log('\n--- formatDateRange ---');
const r = formatDateRange;
ok('aceeasi zi -> o singura data', /^17 sept\.? 2026$/.test(r('2026-09-17', '2026-09-17')), r('2026-09-17', '2026-09-17'));
ok('aceeasi luna -> "1 – 17 sept. 2026"', /^1 – 17 sept\.? 2026$/.test(r('2026-09-01', '2026-09-17')), r('2026-09-01', '2026-09-17'));
ok('luni diferite -> "28 aug. – 3 sept. 2026"', /^28 aug\.? – 3 sept\.? 2026$/.test(r('2026-08-28', '2026-09-03')), r('2026-08-28', '2026-09-03'));
ok('ani diferiti -> ambele cu an', /^29 dec\.? 2025 – 4 ian\.? 2026$/.test(r('2025-12-29', '2026-01-04')), r('2025-12-29', '2026-01-04'));
ok('luna intreaga precedenta', /^1 – 31 aug\.? 2026$/.test(r('2026-08-01', '2026-08-31')), r('2026-08-01', '2026-08-31'));
ok('valori lipsa nu crapa', r(null, '2026-09-17') === '2026-09-17' && r(null, null) === '');

console.log('\n--- formatDateTime / formatPercent ---');
ok('data si ora romaneste', /\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/.test(formatDateTime('2026-09-17T06:12:33Z')), formatDateTime('2026-09-17T06:12:33Z'));
ok('formatDateTime gol -> sir gol', formatDateTime(null) === '');
ok('procent negativ NU primeste "+" in fata', formatPercent(-26.6) === '-26.6%');
ok('procent pozitiv primeste "+"', formatPercent(12.4) === '+12.4%');
ok('procent null -> —', formatPercent(null) === '—');

console.log('\n' + '='.repeat(40) + `\n  ${pass} trecute, ${fail} esuate\n` + '='.repeat(40));
if (fail) process.exitCode = 1;
