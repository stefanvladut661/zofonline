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