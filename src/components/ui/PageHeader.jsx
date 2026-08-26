import React from 'react';
import LiveBadge from './LiveBadge';

export default function PageHeader({ title, subtitle, lastUpdated, actions, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        {lastUpdated && <LiveBadge lastUpdated={lastUpdated} className="mt-1.5" />}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {actions}
        {children}
      </div>
    </div>
  );
}