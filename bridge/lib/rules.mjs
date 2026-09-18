/**
 * Regulile de curatare si maparea randurilor DorSoft -> products + sales
 * (contractul din server/README.md §4).
 *
 * Fiecare regula de mai jos a fost stabilita pe date reale si CONFIRMATA de
 * owner (sau marcata explicit ca NECONFIRMATA). Nu stergem niciodata o linie
 * de vanzare: ori o trimitem, ori sarim documentul intreg si il raportam.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CONFIRMATE                                                               │
 * │  R1 Duplicatele identice (acelasi articol de 2 ori pe bon) sunt perechea  │
 * │     de lentile stanga+dreapta -> se insumeaza in cantitate. Dovada:      │
 * │     TotalCuTVA = suma liniilor NUMARAND ambele copii, in 523/525 bonuri. │
 * │  R2 Pret negativ = discount -> un singur SKU pe locatie ("<loc>-discount"),│
 * │     trimis ca vanzare cu pret negativ, ca totalul sa iasa = TotalCuTVA.   │
 * │     Discountul NU se imparte pe produse.                                  │
 * │  R3 Serviciile (manopera, consultatie) sunt venit real -> raman in sales, │
 * │     apar in products cu categoria "servicii"; fara stoc.                  │
 * │  R4 SKU = "<locatie>-<ArticolRecNo>". ArticolRecNo e unic doar in baza    │
 * │     DorSoft a locatiei respective (bazele sunt separate).                 │
 * │  R5 source_ref = "<NrDoc>-<ArticolRecNo>" (unic pe linie; serverul are    │
 * │     UNIQUE(locatie, source_ref)) + receipt_ref = NrDoc pur, pentru        │
 * │     "bon mediu" si numarul de bonuri.                                     │
 * │  R6 Fara inventory: exportul are miscari de marfa, nu stoc absolut.       │
 * │                                                                          │
 * │ NECONFIRMATE — codul le trateaza conservator si le face VIZIBILE in raport│
 * │  N1 Ridicata = 0 (comanda in lucru sau anulata?) -> INCLUSE ca vanzari,   │
 * │     marcate in raport. Atentie: serverul pastreaza PRIMA versiune primita │
 * │     a unei linii; daca bonul se modifica/anuleaza ulterior in DorSoft,    │
 * │     schimbarea nu mai ajunge pe server.                                   │
 * │  N2 TotalCuTVA gol = document de marfa/receptie -> EXCLUS din sales,       │
 * │     raportat (cate, care).                                                │
 * │  N3 Suma liniilor != TotalCuTVA (bonul taiat la marginea celor 1000 de    │
 * │     randuri) -> SARIT, raportat. Altfel ar intra venit umflat definitiv.  │
 * │     In plus: cand fisierul e PLIN (exact 1000 de randuri), cel mai vechi  │
 * │     document e sarit chiar daca suma pare corecta — a fost trimis intreg  │
 * │     intr-un export anterior, cand era mai nou.                            │
 * │  N4 Liniile "Diverse servicii" (sume mari, neincasate) -> INCLUSE,        │
 * │     raportate separat.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { toNumber, parseDorsoftDate, assertAllDatesParse, localToIso, localDateKey, cleanName, normalizeName } from './parse.mjs';

export const AGENT_VERSION = 'dorsoft-json-bridge/1.0.0';

/** DorSoft exporta cel mult atatea randuri; un fisier cu exact atatea e "plin" (vezi N3). */
export const DEFAULT_EXPORT_ROW_CAP = 1000;

/** Bani in bani (intregi), ca sa nu ne muste virgula mobila la comparatii. */
const cents = (n) => Math.round(n * 100);
const fromCents = (c) => c / 100;

/** R3 + clasificare de afisare. Necunoscutele raman null — nu ghicim. */
export function categorize(denumire, unitPrice) {
  if (unitPrice < 0) return 'discount';
  const n = normalizeName(denumire);
  if (/\b(manoper|consult|servici|tensiune|montaj|reparat|ajustar)/.test(n)) return 'servicii';
  if (/^lentil/.test(n)) return 'lentile';
  if (/^rama\b/.test(n)) return 'rame';
  if (/\b(snur|toc|etui|solutie|laveta|lant|port)\b|pure moist/.test(n)) return 'accesorii';
  return null;
}

/**
 * Transforma randurile unui fisier (= o locatie) in payload-ul pentru /api/ingest
 * si intr-un raport detaliat cu tot ce a fost inclus, exclus sau doar marcat.
 */
export function transform({
  rows, location, timeZone = 'Europe/Bucharest', fileName = 'export', ignoredColumns = [],
  exportRowCap = DEFAULT_EXPORT_ROW_CAP,
}) {
  const loc = String(location).trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(loc)) throw new Error(`Locatie invalida "${location}": doar litere mici, cifre, - si _`);
  const discountSku = `${loc}-discount`;

  // Formatul datei e o proprietate a fisierului: o data gresita = tot fisierul e suspect.
  assertAllDatesParse(rows, fileName);

  const report = {
    fileName, location: loc, timeZone, rowsRead: rows.length, ignoredColumns,
    documents: 0,
    included: { receipts: 0, rows: 0, lines: 0, totalCents: 0 },
    excluded: { stockDocs: [], mismatched: [], invalid: [] },
    flagged: { openOrders: [], diverseServicii: [], repeatedArticle: [], nonPositiveQty: [] },
    merged: { lines: 0, receipts: 0 },
    discount: { lines: 0, totalCents: 0, dorsoftArticles: new Set() },
    productsByCategory: {},
    reconciliation: null,
    period: { from: null, to: null },
    exportFull: exportRowCap > 0 && rows.length === exportRowCap,
    exportOverCap: exportRowCap > 0 && rows.length > exportRowCap ? exportRowCap : null,
  };

  // ── 1. Grupam pe document (NrDoc), pastrand ordinea din fisier ─────────────
  const docs = new Map();
  for (const row of rows) {
    const key = row.NrDoc.trim();
    if (!docs.has(key)) docs.set(key, []);
    docs.get(key).push(row);
  }
  report.documents = docs.size;
  // N3: documentul de la marginea unui export plin (ultimul rand = cel mai vechi).
  const edgeNrDoc = report.exportFull ? rows[rows.length - 1].NrDoc.trim() : null;

  const sales = [];
  const productSeen = new Map(); // sku -> { name, category, price, soldAt, articol }

  for (const [nrDoc, docRows] of docs) {
    const where = `${fileName} bon ${nrDoc}`;
    const head = docRows[0];

    // R5: fara NrDoc nu exista source_ref/receipt_ref — excludem si raportam.
    if (!nrDoc) {
      report.excluded.invalid.push({ nrDoc: '(gol)', reason: `${docRows.length} rand(uri) fara NrDoc`, rows: docRows.length });
      continue;
    }

    // Antetul (campurile de document) trebuie sa fie identic pe toate liniile.
    const inconsistent = ['TransHeaderRecNo', 'DataDoc', 'TotalCuTVA', 'Incasare', 'Ridicata']
      .find((f) => docRows.some((r) => r[f] !== head[f]));
    if (inconsistent) {
      const reason = inconsistent === 'TransHeaderRecNo'
        ? `acelasi NrDoc pe documente diferite (TransHeaderRecNo ${[...new Set(docRows.map((r) => r.TransHeaderRecNo))].join(', ')})`
        : `antet inconsistent intre linii (${inconsistent})`;
      report.excluded.invalid.push({ nrDoc, reason, rows: docRows.length });
      continue;
    }

    // N2: TotalCuTVA gol = document de marfa, nu vanzare.
    if (head.TotalCuTVA.trim() === '') {
      let lineSum = null;
      try { lineSum = fromCents(sumLines(docRows, where)); } catch { /* doar informativ in raport */ }
      report.excluded.stockDocs.push({ nrDoc, date: head.DataDoc, rows: docRows.length, lineSum });
      continue;
    }

    let dateParts, totalCents, lines;
    try {
      dateParts = parseDorsoftDate(head.DataDoc, where);
      totalCents = cents(toNumber(head.TotalCuTVA, `${where} TotalCuTVA`));
      lines = docRows.map((r) => {
        const qty = toNumber(r.Cantitate, `${where} Cantitate`);
        const price = toNumber(r.Pret, `${where} Pret`);
        if (qty == null || price == null) throw new Error(`${where}: Cantitate sau Pret gol`);
        if (!Number.isInteger(qty)) throw new Error(`${where}: cantitate fractionara ${qty} — serverul o trunchiaza, totalul nu ar mai iesi`);
        const articol = r.ArticolRecNo.trim();
        // Linia de discount nu are nevoie de ArticolRecNo (merge pe SKU-ul comun).
        if (!articol && price >= 0) throw new Error(`${where}: rand fara ArticolRecNo`);
        return { articol, qty, priceCents: cents(price), name: r.Denumire };
      });
    } catch (err) {
      report.excluded.invalid.push({ nrDoc, reason: err.message, rows: docRows.length });
      continue;
    }

    // N3: bonul taiat / inconsistent — suma liniilor trebuie sa fie exact totalul,
    // iar documentul de la marginea unui export plin e sarit oricum.
    const lineSum = lines.reduce((s, l) => s + l.qty * l.priceCents, 0);
    const atEdge = nrDoc === edgeNrDoc;
    if (lineSum !== totalCents || atEdge) {
      report.excluded.mismatched.push({
        nrDoc, date: head.DataDoc, rows: docRows.length, atEdge,
        lineSum: fromCents(lineSum), total: fromCents(totalCents), diff: fromCents(lineSum - totalCents),
      });
      continue;
    }

    const soldAt = localToIso(dateParts, timeZone);
    const localDay = localDateKey(dateParts);
    const totalNum = fromCents(totalCents);

    // N1: comanda neridicata (Ridicata = 0) — inclusa, dar vizibila.
    if (head.Ridicata.trim() === '0') report.flagged.openOrders.push({ nrDoc, date: head.DataDoc, total: totalNum, incasare: head.Incasare });

    // N4: "Diverse servicii" — inclusa, raportata separat.
    for (const l of lines) {
      if (normalizeName(l.name).includes('diverse servicii')) {
        report.flagged.diverseServicii.push({ nrDoc, date: head.DataDoc, total: totalNum, qty: l.qty, price: fromCents(l.priceCents), incasare: head.Incasare });
      }
    }

    // ── 2. R1 + R2: acelasi SKU, acelasi pret, acelasi semn al cantitatii -> o linie,
    //    cantitate insumata. Semnul conteaza: o vanzare si returul ei raman linii separate. ──
    const groups = new Map(); // "sku|pret|semn" -> { sku, priceCents, qty, articol, name }
    let mergedHere = 0;
    for (const l of lines) {
      const isDiscount = l.priceCents < 0;
      const sku = isDiscount ? discountSku : `${loc}-${l.articol}`;
      if (isDiscount) {
        report.discount.lines++;
        report.discount.totalCents += l.qty * l.priceCents;
        if (l.articol) report.discount.dorsoftArticles.add(l.articol);
      }
      if (l.qty <= 0) report.flagged.nonPositiveQty.push({ nrDoc, sku, qty: l.qty, price: fromCents(l.priceCents), name: cleanName(l.name) });
      const key = `${sku}|${l.priceCents}|${l.qty < 0 ? '-' : '+'}`;
      const g = groups.get(key);
      if (g) { g.qty += l.qty; mergedHere++; }
      else groups.set(key, { sku, priceCents: l.priceCents, qty: l.qty, articol: l.articol, name: l.name, isDiscount });
    }
    if (mergedHere) { report.merged.lines += mergedHere; report.merged.receipts++; }

    // ── 3. R5: source_ref unic pe linie. Acelasi SKU la preturi diferite pe acelasi bon
    //    (nu apare in datele de acum, dar e posibil) primeste sufix -2, -3 … ──
    const perSku = new Map();
    for (const g of groups.values()) {
      if (!perSku.has(g.sku)) perSku.set(g.sku, []);
      perSku.get(g.sku).push(g);
    }
    for (const [sku, gs] of perSku) {
      // Semnalam doar preturile diferite; vanzare + retur la acelasi pret apare deja la cantitati negative.
      if (new Set(gs.map((g) => g.priceCents)).size > 1) report.flagged.repeatedArticle.push({ nrDoc, sku, prices: gs.map((g) => fromCents(g.priceCents)) });
      gs.forEach((g, i) => {
        const refArticol = g.isDiscount ? 'discount' : g.articol;
        g.sourceRef = i === 0 ? `${nrDoc}-${refArticol}` : `${nrDoc}-${refArticol}-${i + 1}`;
      });
    }

    for (const g of groups.values()) {
      sales.push({
        source_ref: g.sourceRef,
        receipt_ref: nrDoc,
        sku: g.sku,
        quantity: g.qty,
        unit_price: fromCents(g.priceCents),
        sold_at: soldAt,
        channel: 'fizic',
      });
      // Catalogul: numele si pretul de la cea mai recenta vanzare a articolului.
      const seen = productSeen.get(g.sku);
      if (!seen || soldAt > seen.soldAt) {
        const name = cleanName(g.name);
        productSeen.set(g.sku, {
          sku: g.sku,
          name: g.isDiscount ? 'Discount / reducere' : (name || null),
          category: g.isDiscount ? 'discount' : categorize(g.name, fromCents(g.priceCents)),
          price: g.isDiscount ? null : fromCents(g.priceCents),
          soldAt,
          articol: g.isDiscount ? null : g.articol,
          denumire: g.isDiscount ? null : (name ? g.name : null),
        });
      }
    }

    report.included.receipts++;
    report.included.rows += docRows.length;
    report.included.lines += groups.size;
    report.included.totalCents += totalCents;
    if (!report.period.from || localDay < report.period.from) report.period.from = localDay;
    if (!report.period.to || localDay > report.period.to) report.period.to = localDay;
  }

  // ── 4. Ordine stabila: cronologic, apoi bon, apoi source_ref ──
  sales.sort((a, b) => a.sold_at.localeCompare(b.sold_at) || a.receipt_ref.localeCompare(b.receipt_ref) || a.source_ref.localeCompare(b.source_ref));

  const products = [...productSeen.values()]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      brand: null,
      category: p.category,
      size: null,
      price: p.price,
      cost_price: null,
      image_url: null,
      attributes: p.category === 'discount'
        ? { locatie: loc, tip: 'discount', articole_dorsoft: [...report.discount.dorsoftArticles].sort((a, b) => Number(a) - Number(b)) }
        : { locatie: loc, articol_rec_no: p.articol, denumire_dorsoft: p.denumire, sursa: 'dorsoft-json' },
    }));

  for (const p of products) {
    const c = p.category ?? 'necunoscut';
    report.productsByCategory[c] = (report.productsByCategory[c] ?? 0) + 1;
  }

  // ── 5. Reconciliere: ce trimitem trebuie sa fie EXACT suma TotalCuTVA a bonurilor incluse ──
  const sentCents = sales.reduce((s, x) => s + cents(x.quantity * x.unit_price), 0);
  report.reconciliation = {
    sent: fromCents(sentCents),
    dorsoft: fromCents(report.included.totalCents),
    ok: sentCents === report.included.totalCents,
  };
  report.discount.total = fromCents(report.discount.totalCents);
  report.discount.dorsoftArticles = [...report.discount.dorsoftArticles];

  return {
    products,
    sales,
    watermark: sales.length ? sales[sales.length - 1].sold_at : null,
    report,
  };
}

function sumLines(docRows, where) {
  let s = 0;
  for (const r of docRows) {
    const q = toNumber(r.Cantitate, `${where} Cantitate`) ?? 0;
    const p = toNumber(r.Pret, `${where} Pret`) ?? 0;
    s += cents(q * p);
  }
  return s;
}

/** Corpul cererii /api/ingest. Fara inventory (R6). */
export function buildPayload({ products, sales, watermark }) {
  const payload = { agent_version: AGENT_VERSION };
  if (watermark) payload.watermark = watermark;
  if (products?.length) payload.products = products;
  if (sales?.length) payload.sales = sales;
  return payload;
}
