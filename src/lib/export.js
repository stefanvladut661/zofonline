/**
 * Generare si descarcare de rapoarte.
 *
 * Detalii care conteaza in practica, nu doar in teorie:
 *  - separatorul e „;", nu „,". Excel pe Windows cu setari romanesti citeste
 *    fisierele cu virgula ca o singura coloana;
 *  - fisierul incepe cu BOM UTF-8, altfel diacriticele apar ca „Ã¢” in Excel;
 *  - numerele se scriu cu virgula zecimala, cum le asteapta Excel-ul romanesc.
 */

import { toXlsx, XLSX_MIME } from './xlsx';

const SEP = ';';
const BOM = '﻿';

function escapeCell(value) {
  if (value === null || value === undefined) return '';

  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  }

  const text = String(value);
  // Ghilimele duble in interior se dubleaza; campul se citeaza daca contine
  // separator, ghilimele sau rand nou.
  if (text.includes(SEP) || text.includes('"') || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * @param {Array<{key: string, label: string, map?: (row: any) => unknown}>} columns
 * @param {Array<object>} rows
 */
export function toCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.label)).join(SEP);
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(c.map ? c.map(row) : row[c.key])).join(SEP),
  );
  return BOM + [header, ...body].join('\r\n');
}

export function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Eliberarea imediata anuleaza descarcarea in unele browsere.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Excel nativ (.xlsx): aceleasi coloane ca la CSV, dar numerele raman numere
 * si diacriticele nu depind de cum ghiceste Excel codificarea.
 */
export function downloadXlsx(filename, { columns, rows, sheetName, title }) {
  downloadFile(filename, new Blob([toXlsx(columns, rows, { sheetName, title })], { type: XLSX_MIME }));
}

export function timestampSuffix(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

/**
 * Fonturile standard din PDF (Helvetica & co.) nu au glifuri pentru ă â î ș ț —
 * jsPDF le desena ca spatii goale („Ram bărbai”). Incorporam Roboto (OFL, in
 * public/fonts), care le are. Se descarca o singura data pe sesiune, doar cand
 * se genereaza primul PDF.
 */
const PDF_FONT_FAMILY = 'Roboto';
const PDF_FONT_FILES = { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Bold.ttf' };
let pdfFontsPromise = null;

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // In bucati: String.fromCharCode(...bytes) depaseste limita de argumente.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function loadPdfFonts() {
  if (!pdfFontsPromise) {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    pdfFontsPromise = Promise.all(Object.entries(PDF_FONT_FILES).map(async ([style, file]) => {
      const res = await fetch(`${base}fonts/${file}`);
      if (!res.ok) throw new Error(`fontul ${file} nu s-a putut încărca (HTTP ${res.status})`);
      return [style, bytesToBase64(await res.arrayBuffer())];
    })).then(Object.fromEntries)
      .catch((err) => { pdfFontsPromise = null; throw err; });
  }
  return pdfFontsPromise;
}

/** Ultima solutie, daca fontul nu se poate incarca: text lizibil, fara diacritice. */
function stripDiacritics(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[șş]/g, 's').replace(/[ȘŞ]/g, 'S')
    .replace(/[țţ]/g, 't').replace(/[ȚŢ]/g, 'T');
}

/** Inregistreaza fontul in document; intoarce familia de folosit si cum se pregateste textul. */
async function preparePdfFont(doc) {
  try {
    const fonts = await loadPdfFonts();
    for (const [style, file] of Object.entries(PDF_FONT_FILES)) {
      doc.addFileToVFS(file, fonts[style]);
      doc.addFont(file, PDF_FONT_FAMILY, style);
    }
    return { family: PDF_FONT_FAMILY, text: (s) => s };
  } catch (err) {
    console.warn(`PDF fără diacritice: ${err.message}`);
    return { family: 'helvetica', text: stripDiacritics };
  }
}

/**
 * PDF cu tabel, desenat manual peste jsPDF.
 * Nu folosim jspdf-autotable ca sa nu adaugam o dependinta pentru cateva tabele
 * simple. jsPDF e deja in proiect.
 */
export async function downloadPdf(filename, { title, subtitle, columns, rows, summary }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait', unit: 'pt' });
  const font = await preparePdfFont(doc);
  const t = font.text;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const usable = pageWidth - margin * 2;
  let y = margin;

  doc.setFont(font.family, 'bold');
  doc.setFontSize(16);
  doc.text(t(title), margin, y);
  y += 18;

  doc.setFont(font.family, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(t(subtitle ?? `Generat: ${formatDateTime(new Date())}`), margin, y);
  y += 20;

  if (summary?.length) {
    doc.setTextColor(40);
    doc.setFontSize(10);
    for (const line of summary) {
      doc.text(t(line), margin, y);
      y += 14;
    }
    y += 6;
  }

  const cellPad = 4;
  const cellText = (c, row) => {
    const raw = c.map ? c.map(row) : row[c.key];
    return raw === null || raw === undefined ? '' : t(String(raw));
  };

  // Latimea coloanelor: dupa continutul masurat (antet + valori), nu egale.
  // Altfel „Tip" ocupa cat „Denumire produs" si antetele lungi se taie desi
  // ramane loc gol alaturi. Daca tot nu incape, se scaleaza proportional si
  // `fit` taie cu „…".
  const natural = columns.map((c) => {
    doc.setFont(font.family, 'bold');
    doc.setFontSize(9);
    let w = doc.getTextWidth(t(String(c.label)));
    doc.setFont(font.family, 'normal');
    doc.setFontSize(8);
    for (const row of rows.slice(0, 300)) w = Math.max(w, doc.getTextWidth(cellText(c, row)));
    return Math.max(30, w + cellPad * 2 + 2);
  });
  const naturalTotal = natural.reduce((s, w) => s + w, 0);
  const colWidths = natural.map((w) => (w / naturalTotal) * usable);
  const colX = colWidths.map((_, i) => margin + colWidths.slice(0, i).reduce((s, w) => s + w, 0));

  // Taiem ce nu incape, masurat cu fontul curent — nu estimat din numarul de
  // caractere, ca sa nu se suprapuna coloanele si sa nu pierdem loc degeaba.
  const fit = (text, i) => {
    const max = colWidths[i] - cellPad * 2;
    if (doc.getTextWidth(text) <= max) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (doc.getTextWidth(`${text.slice(0, mid)}…`) <= max) lo = mid; else hi = mid - 1;
    }
    return `${text.slice(0, lo)}…`;
  };

  const drawHeader = () => {
    doc.setFillColor(240, 240, 245);
    doc.rect(margin, y - 11, usable, 18, 'F');
    doc.setFont(font.family, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(40);
    columns.forEach((c, i) => {
      doc.text(fit(t(String(c.label)), i), colX[i] + cellPad, y);
    });
    y += 18;
    doc.setFont(font.family, 'normal');
  };

  drawHeader();

  doc.setFontSize(8);
  for (const row of rows) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFontSize(8);
    }
    columns.forEach((c, i) => {
      doc.text(fit(cellText(c, row), i), colX[i] + cellPad, y);
    });
    y += 13;
  }

  doc.setFontSize(8);
  doc.setTextColor(150);
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.text(`${p} / ${pages}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
    doc.text('Zof Optogerman', margin, pageHeight - 20);
  }

  doc.save(filename);
}
