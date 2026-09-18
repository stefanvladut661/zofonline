import React from 'react';
import { FileClock } from 'lucide-react';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useDataSourceStatus } from '@/lib/data-source';

/**
 * Indicatorul de prospetime a datelor.
 *
 * Inainte afisa mereu un punct verde pulsand si textul "Live", indiferent daca
 * datele veneau de la bridge sau din demo-data.js. Exact asta face datele false
 * sa arate a date reale. Acum starea demo castiga si badge-ul devine un
 * avertisment.
 *
 * Doua moduri:
 *  - `freshness` (dashboard): datele vin din exportul DorSoft de a doua zi, deci
 *    nu sunt niciodata „de acum". Aratam DATA FISIERULUI din care vin cifrele
 *    („Date din 17.09.2026, 08:12"), nu un punct verde. Daca o locatie a ramas
 *    cu un fisier mai vechi cu peste o zi decat cea mai noua, o numim.
 *  - `lastUpdated` (celelalte ecrane): „Live • acum X", ca inainte.
 */
const STALE_MS = 24 * 60 * 60 * 1000;

function FreshnessBadge({ freshness, className }) {
  if (freshness.loading) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
        <FileClock className="w-3.5 h-3.5" />
        <span>Date din: se încarcă…</span>
      </div>
    );
  }

  const { asOf, syncedAt, sources = [] } = freshness;
  const when = asOf ?? syncedAt;
  if (!when) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
        <FileClock className="w-3.5 h-3.5" />
        <span>Fără date sincronizate încă</span>
      </div>
    );
  }

  const stale = asOf
    ? sources.filter((s) => s.as_of && Date.parse(asOf) - Date.parse(s.as_of) > STALE_MS)
    : [];
  const details = sources
    .map((s) => `${s.location}: ${s.file ?? 'fișier necunoscut'} · ${formatDateTime(s.as_of ?? s.synced_at)}`)
    .join('\n');

  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap ${className}`} title={details || undefined}>
      <FileClock className="w-3.5 h-3.5 text-primary" />
      <span>
        {asOf ? 'Date din' : 'Ultima sincronizare'}{' '}
        <span className="font-medium text-foreground">{formatDateTime(when)}</span>
        {' '}· {timeAgo(when)}
      </span>
      {stale.length > 0 && (
        <span className="text-amber-700 dark:text-amber-500">
          {`· ${stale.map((s) => s.location).join(', ')}: fișier mai vechi`}
        </span>
      )}
    </div>
  );
}

export default function LiveBadge({ lastUpdated, freshness, className = '' }) {
  const { isDemo } = useDataSourceStatus();

  if (isDemo) {
    return (
      <div className={`flex items-center gap-1.5 text-xs font-medium text-amber-500 ${className}`}>
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <span>Date demo • nu sunt date reale</span>
      </div>
    );
  }

  if (freshness) return <FreshnessBadge freshness={freshness} className={className} />;

  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span>Live • {lastUpdated ? timeAgo(lastUpdated) : 'actualizare...'}</span>
    </div>
  );
}
