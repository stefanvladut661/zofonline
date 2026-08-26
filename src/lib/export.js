/**
 * Generare si descarcare de rapoarte.
 *
 * Detalii care conteaza in practica, nu doar in teorie:
 *  - separatorul e „;", nu „,". Excel pe Windows cu setari romanesti citeste
 *    fisierele cu virgula ca o singura coloana;
 *  - fisierul incepe cu BOM UTF-8, altfel diacriticele apar ca „Ã¢” in Excel;
 *  - numerele se scriu cu virgula zecimala, cum le asteapta Excel-ul romanesc.
 */

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

/**
 * PDF cu tabel, desenat manual peste jsPDF.
 * Nu folosim jspdf-autotable ca sa nu adaugam o dependinta pentru cateva tabele
 * simple. jsPDF e deja in proiect.
 */
export async function downloadPdf(filename, { title, subtitle, columns, rows, summary }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait', unit: 'pt' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const usable = pageWidth - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(subtitle ?? `Generat: ${formatDateTime(new Date())}`, margin, y);
  y += 20;

  if (summary?.length) {
    doc.setTextColor(40);
    doc.setFontSize(10);
    for (const line of summary) {
      doc.text(line, margin, y);
      y += 14;
    }
    y += 6;
  }

  const colWidth = usable / columns.length;

  const drawHeader = () => {
    doc.setFillColor(240, 240, 245);
    doc.rect(margin, y - 11, usable, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(40);
    columns.forEach((c, i) => {
      doc.text(String(c.label), margin + i * colWidth + 4, y);
    });
    y += 18;
    doc.setFont('helvetica', 'normal');
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
      const raw = c.map ? c.map(row) : row[c.key];
      const text = raw === null || raw === undefined ? '' : String(raw);
      // Taiem ce nu incape, ca sa nu se suprapuna coloanele.
      const max = Math.floor(colWidth / 4.4);
      doc.text(text.length > max ? `${text.slice(0, max - 1)}…` : text, margin + i * colWidth + 4, y);
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
