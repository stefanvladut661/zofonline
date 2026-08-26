import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Globe } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format';

export default function LocationsOverview({ locations, loading }) {
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

  const totalSales = (locations || []).reduce((sum, l) => sum + (l.sales_today || 0), 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 lg:p-5"
    >
      <h3 className="font-semibold text-sm mb-4">Performanță locații</h3>
      <div className="space-y-2.5">
        {(locations || []).map((loc, i) => {
          const pct = totalSales > 0 ? (loc.sales_today / totalSales) * 100 : 0;
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
                <span className="text-xs font-bold">{formatCurrency(loc.sales_today)}</span>
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
                <span>{formatNumber(loc.units_today)} produse azi</span>
                <span>Luna: {formatCurrency(loc.sales_month)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}