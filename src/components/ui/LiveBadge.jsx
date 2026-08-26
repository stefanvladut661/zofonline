import React from 'react';
import { timeAgo } from '@/lib/format';

export default function LiveBadge({ lastUpdated, className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span>Live • {lastUpdated ? timeAgo(lastUpdated) : 'actualizare...'}</span>
    </div>
  );
}