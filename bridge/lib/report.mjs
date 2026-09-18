/**
 * Raportul de dupa transformare — scris pentru un om care verifica ochiometric
 * inainte de trimiterea reala: cate randuri au intrat, cate au fost sarite si
 * DE CE, ce a fost inclus dar e inca neconfirmat.
 */

const lei = (n) => `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} lei`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function list(items, render, max = 30) {
  if (!items.length) return ['    (niciunul)'];
  const shown = items.slice(0, max).map((x) => '    ' + render(x));
  if (items.length > max) shown.push(`    … si inca ${items.length - max}`);
  return shown;
}

/**
 * `status`: 'dry-run' | 'pending' (inainte de trimitere) | 'sent' | 'failed'.
 * Raportul salvat pe disc e rescris dupa trimitere, ca sa spuna ce s-a intamplat cu adevarat.
 */
export function renderReport(r, { dryRun, status = dryRun ? 'dry-run' : 'pending', payloadPath, outcome } = {}) {
  const out = [];
  const H = (t) => { out.push('', t, '-'.repeat(t.length)); };
  const HEADERS = {
    'dry-run': '(DRY-RUN — nimic nu a fost trimis)',
    pending: '(TRIMITERE — inca netrimis; daca raportul ramane asa, trimiterea nu s-a incheiat)',
    sent: '(TRIMITERE REALA — reusita)',
    failed: '(TRIMITERE REALA — ESUATA)',
  };

  out.push('='.repeat(72));
  out.push(`RAPORT PUNTE DORSOFT  ${HEADERS[status] ?? HEADERS.pending}`);
  out.push('='.repeat(72));
  if (outcome) out.push(`Rezultat:  ${outcome}`);
  out.push(`Fisier:    ${r.fileName}`);
  out.push(`Locatie:   ${r.location}   (SKU-urile devin "${r.location}-<ArticolRecNo>")`);
  out.push(`Fus orar:  ${r.timeZone} -> orele sunt trimise in UTC (ISO 8601)`);
  if (r.period.from) out.push(`Perioada:  ${r.period.from} … ${r.period.to} (bonurile incluse, dupa data locala)`);
  if (r.exportFull) out.push(`Fisier PLIN (${r.rowsRead} randuri = limita exportului): cel mai vechi document e sarit, vezi N3.`);
  if (r.exportOverCap) out.push(`ATENTIE: fisierul are ${r.rowsRead} randuri, peste ZOF_EXPORT_ROW_CAP=${r.exportOverCap} — limita din .env nu e cea reala a exportului; verifica configurarea.`);
  if (payloadPath) out.push(`Payload:   ${payloadPath}`);
  if (r.ignoredColumns.length) out.push(`Coloane IGNORATE (nu sunt trimise): ${r.ignoredColumns.join(', ')}`);

  H('1. CE A INTRAT');
  out.push(`  Randuri citite:            ${r.rowsRead}`);
  out.push(`  Documente in fisier:       ${r.documents}`);
  out.push(`  Bonuri de vanzare TRIMISE: ${r.included.receipts}  (${r.included.rows} randuri -> ${r.included.lines} linii de vanzare)`);
  out.push(`  Perechi de lentile insumate (R1): ${plural(r.merged.lines, 'linie', 'linii')} in ${plural(r.merged.receipts, 'bon', 'bonuri')}`);
  out.push(`  Linii de discount (R2):    ${r.discount.lines}  in total ${lei(r.discount.total)}  -> SKU "${r.location}-discount"` +
    (r.discount.dorsoftArticles.length ? `  (din ${plural(r.discount.dorsoftArticles.length, 'articol DorSoft', 'articole DorSoft')})` : ''));
  out.push(`  Produse in catalog:        ${Object.values(r.productsByCategory).reduce((a, b) => a + b, 0)}  ` +
    `[${Object.entries(r.productsByCategory).map(([k, v]) => `${k}: ${v}`).join(', ')}]`);

  H('2. RECONCILIERE (trebuie sa fie egale)');
  out.push(`  Suma vanzarilor trimise:         ${lei(r.reconciliation.sent)}`);
  out.push(`  Suma TotalCuTVA (bonuri incluse): ${lei(r.reconciliation.dorsoft)}`);
  out.push(`  ${r.reconciliation.ok ? 'OK — identice la ban.' : '!!! DIFERENTA — NU trimite, ceva e gresit in reguli.'}`);

  H('3. EXCLUSE (nu au fost trimise) si DE CE');
  const ex = r.excluded;
  out.push(`  N2  Documente de marfa / receptii (TotalCuTVA gol): ${plural(ex.stockDocs.length, 'document', 'documente')}, ${ex.stockDocs.reduce((s, d) => s + d.rows, 0)} randuri`);
  out.push(...list(ex.stockDocs, (d) => `doc ${d.nrDoc}  ${d.date}  ${d.rows} randuri, valoare linii ${d.lineSum == null ? '?' : lei(d.lineSum)}`));
  out.push(`  N3  Bonuri sarite — suma liniilor != TotalCuTVA sau la marginea unui export plin: ${ex.mismatched.length}`);
  out.push(...list(ex.mismatched, (d) => `bon ${d.nrDoc}  ${d.date}  linii ${lei(d.lineSum)} vs total ${lei(d.total)} (diferenta ${lei(d.diff)}, ${d.rows} randuri)` +
    (d.atEdge ? '  [cel mai vechi document din fisierul plin — probabil taiat]' : '')));
  out.push(`  Documente invalide (nu s-au putut citi): ${ex.invalid.length}`);
  out.push(...list(ex.invalid, (d) => `doc ${d.nrDoc}: ${d.reason}`));

  H('4. INCLUSE, DAR NECONFIRMATE — de verificat in DorSoft');
  const fl = r.flagged;
  out.push(`  N1  Bonuri cu Ridicata = 0 (comanda in lucru sau anulata?): ${fl.openOrders.length}, ` +
    `in valoare de ${lei(fl.openOrders.reduce((s, d) => s + d.total, 0))}`);
  out.push(...list(fl.openOrders, (d) => `bon ${d.nrDoc}  ${d.date}  total ${lei(d.total)}  incasat: ${d.incasare === '' ? '(nimic)' : d.incasare}`));
  out.push(`  N4  Linii "Diverse servicii": ${fl.diverseServicii.length}`);
  out.push(...list(fl.diverseServicii, (d) => `bon ${d.nrDoc}  ${d.date}  ${d.qty} x ${lei(d.price)}  (total bon ${lei(d.total)}, incasat: ${d.incasare === '' ? '(nimic)' : d.incasare})`));
  out.push(`  Acelasi articol la preturi diferite pe acelasi bon (sufix -2 la source_ref): ${fl.repeatedArticle.length}`);
  out.push(...list(fl.repeatedArticle, (d) => `bon ${d.nrDoc}  ${d.sku}  preturi: ${d.prices.join(' / ')}`));
  out.push(`  Linii cu cantitate zero sau negativa (retur?): ${fl.nonPositiveQty.length}`);
  out.push(...list(fl.nonPositiveQty, (d) => `bon ${d.nrDoc}  ${d.sku}  ${d.qty} x ${lei(d.price)}  ${d.name}`));

  out.push('', '='.repeat(72));
  return out.join('\n');
}

/** Un rand pe fisier, pentru cand se proceseaza mai multe deodata. */
export function renderSummaryLine(r) {
  return `${r.fileName}: ${r.included.receipts} bonuri trimise (${lei(r.reconciliation.dorsoft)}), ` +
    `${r.excluded.stockDocs.length} doc. marfa excluse, ${r.excluded.mismatched.length} bonuri sarite, ` +
    `${r.flagged.openOrders.length} neridicate incluse, reconciliere ${r.reconciliation.ok ? 'OK' : 'ESUATA'}`;
}
