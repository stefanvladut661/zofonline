import React from 'react';
import { timeAgo } from '@/lib/format';
import { useDataSourceStatus } from '@/lib/data-source';

/**
 * Indicatorul de prospetime a datelor.
 *
 * Inainte afisa mereu un punct verde pulsand si textul "Live", indiferent daca
 * datele veneau de la bridge sau din demo-data.js. Exact asta face datele false
 * sa arate a date reale. Acum starea demo castiga si badge-ul devine un
 * avertisment.
 */
export default function LiveBadge({ lastUpdated, className = '' }) {
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
