import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Globe } from 'lucide-react';
import { formatCurrency, formatNumber, formatDay, formatDateRange } from '@/lib/format';

/**
 * Vanzarile per locatie in ULTIMA ZI RAPORTATA (nu „azi": exportul DorSoft vine
 * a doua zi, deci azi ar fi mereu 0) si in luna curenta, cu perioadele afisate.
 */
export default function LocationsOverview({ locations, loading, period }) {
  if (loading) {
    return (
      <div className="glass rounded-xl p-5">
        <div className="h-4 w-32 shimmer rounded mb-4" />
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-16 shimmer rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Servere mai vechi trimit doar sales_today; le folosim ca fallback.
  const lastDayOf = (l) => l.sales_last_day ?? l.sales_today ?? 0;
  const unitsOf = (l) => l.units_last_day ?? l.units_today ?? 0;
  const periods = period ?? locations?.[0]?.period;
  const dayLabel = periods?.last_day ? formatDay(periods.last_day.to) : 'ultima zi';
  const monthLabel = periods?.month ? formatDateRange(periods.month.from, periods.month.to) : 'luna curentă';

  const totalSales = (locations || []).reduce((sum, l) => sum + lastDayOf(l), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 lg:p-5"
    >
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <h3 className="font-semibold text-sm">Performanță locații</h3>
        <span className="text-[10px] text-muted-foreground tabular-nums">ultima zi raportată · {dayLabel}</span>
      </div>
      <div className="space-y-2.5">
        {(locations || []).map((loc, i) => {
          const dayValue = lastDayOf(loc);
          const pct = totalSales > 0 ? (dayValue / totalSales) * 100 : 0;
          return (
            <div key={loc.id || i} className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {loc.type === 'online' ? (
                    <Globe className="w-4 h-4 text-accent" />
                  ) : (
                    <MapPin className="w-4 h-4 text-primary" />
                  )}
                  <span className="text-xs font-semibold">{loc.name}</span>
                  {loc.type === 'online' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-medium">ONLINE</span>
                  )}
                </div>
                <span className="text-xs font-bold">{formatCurrency(dayValue)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium w-10 text-right">{pct.toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>{formatNumber(unitsOf(loc))} produse în ultima zi</span>
                <span>{monthLabel}: {formatCurrency(loc.sales_month)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
