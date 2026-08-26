import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, Package, TrendingUp, TrendingDown, Clock, ChevronRight } from 'lucide-react';
import { timeAgo } from '@/lib/format';

const SEVERITY_STYLES = {
  high: 'border-l-destructive bg-destructive/5',
  medium: 'border-l-warning bg-warning/5',
  low: 'border-l-muted-foreground bg-muted/30',
  info: 'border-l-primary bg-primary/5',
};

const TYPE_ICONS = {
  critical_stock: AlertTriangle,
  out_of_stock: Package,
  trending: TrendingUp,
  sales_drop: TrendingDown,
  no_sales: Clock,
};

export default function AlertsPreview({ alerts, loading }) {
  if (loading) {
    return (
      <div className="glass rounded-xl p-5">
        <div className="h-4 w-24 shimmer rounded mb-4" />
        <div className="space-y-2">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-14 shimmer rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 lg:p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Alerte recente</h3>
        <Link to="/alerte" className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5">
          Vezi toate <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {(alerts || []).slice(0, 5).map((alert, i) => {
          const Icon = TYPE_ICONS[alert.type] || AlertTriangle;
          return (
            <div 
              key={alert.id || i}
              className={`p-3 rounded-lg border-l-2 ${SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.low} transition-colors`}
            >
              <div className="flex items-start gap-2">
                <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug">{alert.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(alert.timestamp)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}