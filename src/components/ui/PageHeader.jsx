import React from 'react';
import LiveBadge from './LiveBadge';

/**
 * `lastUpdated`: badge „Live • acum X" (ecrane care se actualizeaza singure).
 * `freshness`:   badge „Date din <data fisierului>" — vezi LiveBadge; se
 *                construieste cu `freshnessOf(dashboardData)`.
 */
export default function PageHeader({ title, subtitle, lastUpdated, freshness, actions, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        {(lastUpdated || freshness) && (
          <LiveBadge lastUpdated={lastUpdated} freshness={freshness} className="mt-1.5" />
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {actions}
        {children}
      </div>
    </div>
  );
}

/** Din raspunsul /api/dashboard -> prop-ul `freshness` (sau „se incarca" cat lipseste). */
export function freshnessOf(dashboard) {
  if (!dashboard) return { loading: true };
  return {
    asOf: dashboard.data_as_of ?? null,
    syncedAt: dashboard.last_sync_at ?? null,
    sources: dashboard.data_sources ?? [],
  };
}
