export function formatCurrency(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat('ro-RO', { 
    style: 'decimal', 
    minimumFractionDigits: 0,
    maximumFractionDigits: 0 
  }).format(value) + ' RON';
}

export function formatNumber(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat('ro-RO').format(value);
}

export function formatPercent(value) {
  if (value == null) return "—";
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/** "2026-09-17T06:12:33Z" -> "17.09.2026, 09:12" (ora locala a browserului). */
export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Zi locala "YYYY-MM-DD" -> Date, fara sa treaca prin UTC (new Date('2026-09-17')
 * e miezul noptii UTC, adica inca 16 septembrie in unele fusuri).
 */
function parseDay(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** "2026-09-17" -> "17 sept. 2026". */
export function formatDay(day, { year = true } = {}) {
  const d = parseDay(day);
  if (!d) return day ? String(day) : '';
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
}

/**
 * Interval de zile, cat mai scurt fara sa fie ambiguu:
 *   aceeasi zi          -> "17 sept. 2026"
 *   aceeasi luna        -> "1 – 17 sept. 2026"
 *   luni diferite       -> "28 aug. – 3 sept. 2026"
 *   ani diferiti        -> "29 dec. 2025 – 4 ian. 2026"
 */
export function formatDateRange(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return [from, to].filter(Boolean).join(' – ');
  if (from === to) return formatDay(to);
  if (a.getFullYear() !== b.getFullYear()) return `${formatDay(from)} – ${formatDay(to)}`;
  if (a.getMonth() !== b.getMonth()) return `${formatDay(from, { year: false })} – ${formatDay(to)}`;
  return `${a.getDate()} – ${formatDay(to)}`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 10) return "chiar acum";
  if (seconds < 60) return `acum ${seconds} secunde`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `acum ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `acum ${hours} ore`;
  const days = Math.floor(hours / 24);
  return `acum ${days} zile`;
}