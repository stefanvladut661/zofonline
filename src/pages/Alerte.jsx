import React, { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { useApiPolling } from '@/lib/hooks/useApiPolling';
import { DorsoftAPI } from '@/lib/api-service';
import { demoFallback } from '@/lib/data-source';
import { DEMO_ALERTS } from '@/lib/demo-data';
import { timeAgo } from '@/lib/format';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Package, TrendingUp, TrendingDown, Clock, Bell } from 'lucide-react';

const SEVERITY_STYLES = {
  high: 'border-l-red-500 bg-red-500/5',
  medium: 'border-l-amber-500 bg-amber-500/5',
  low: 'border-l-slate-400 bg-muted/30',
  info: 'border-l-blue-500 bg-blue-500/5',
};

const SEVERITY_BADGES = {
  high: 'bg-red-500/10 text-red-600 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  info: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

const TYPE_ICONS = {
  critical_stock: AlertTriangle,
  out_of_stock: Package,
  trending: TrendingUp,
  sales_drop: TrendingDown,
  no_sales: Clock,
};

const TYPE_LABELS = {
  critical_stock: 'Stoc critic',
  out_of_stock: 'Stoc epuizat',
  trending: 'Trending',
  sales_drop: 'Scădere vânzări',
  no_sales: 'Fără vânzări',
};

const SEVERITY_LABELS = {
  high: 'Ridicat',
  medium: 'Mediu',
  low: 'Scăzut',
  info: 'Informativ',
};

export default function Alerte() {
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: alerts, isLoading } = useApiPolling(
    'alerts',
    demoFallback('alerts', DorsoftAPI.getAlerts, DEMO_ALERTS),
    15000);

  const filtered = (alerts || []).filter(a => {
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader 
        title="Centru de alerte"
        subtitle={`${filtered.length} alerte active`}
        lastUpdated={new Date().toISOString()}
      />

      <div className="glass rounded-xl p-3 flex flex-col sm:flex-row gap-2">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-transparent border-0"><SelectValue placeholder="Severitate" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate severitățile</SelectItem>
            {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-transparent border-0"><SelectValue placeholder="Tip" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate tipurile</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => <div key={i} className="glass rounded-xl p-4 h-16 shimmer" />)
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((alert, i) => {
              const Icon = TYPE_ICONS[alert.type] || Bell;
              return (
                <motion.div
                  key={alert.id || i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className={`glass rounded-xl p-4 border-l-2 ${SEVERITY_STYLES[alert.severity] || ''} hover:shadow-md transition-all`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted/40">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{alert.message}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="outline" className={`text-[10px] ${SEVERITY_BADGES[alert.severity]}`}>
                          {SEVERITY_LABELS[alert.severity]}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {TYPE_LABELS[alert.type]}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(alert.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}