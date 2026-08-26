import React from 'react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { timeAgo } from '@/lib/format';
import { Zap, Heart, RefreshCw, Package, ShoppingBag, ArrowLeftRight, AlertCircle } from 'lucide-react';

const EVENT_CONFIG = {
  SALE_CREATED: { label: 'Vânzare', icon: ShoppingBag, color: 'bg-emerald-500/10 text-emerald-600' },
  STOCK_UPDATED: { label: 'Stoc actualizat', icon: Package, color: 'bg-blue-500/10 text-blue-600' },
  TRANSFER_CREATED: { label: 'Transfer', icon: ArrowLeftRight, color: 'bg-violet-500/10 text-violet-600' },
  PRODUCT_UPDATED: { label: 'Produs actualizat', icon: Package, color: 'bg-amber-500/10 text-amber-600' },
  HEARTBEAT: { label: 'Heartbeat', icon: Heart, color: 'bg-muted text-muted-foreground' },
  CONNECTOR_ONLINE: { label: 'Conectat', icon: Zap, color: 'bg-emerald-500/10 text-emerald-600' },
  CONNECTOR_OFFLINE: { label: 'Deconectat', icon: AlertCircle, color: 'bg-red-500/10 text-red-600' },
  SYNC_FULL: { label: 'Sync complet', icon: RefreshCw, color: 'bg-primary/10 text-primary' },
  SYNC_INCREMENTAL: { label: 'Sync incremental', icon: RefreshCw, color: 'bg-primary/10 text-primary' },
};

const STATUS_BADGE = {
  ok: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  error: 'bg-red-500/10 text-red-600 border-red-500/20',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
};

export default function EventLogTable({ events, showHeartbeats }) {
  const filtered = showHeartbeats ? events : (events || []).filter(e => e.event_type !== 'HEARTBEAT');

  if (!filtered?.length) {
    return <p className="text-center text-sm text-muted-foreground py-8">Niciun eveniment înregistrat</p>;
  }

  return (
    <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
      {filtered.map((event, i) => {
        const config = EVENT_CONFIG[event.event_type] || { label: event.event_type, icon: Zap, color: 'bg-muted text-muted-foreground' };
        const Icon = config.icon;
        return (
          <motion.div
            key={event.id || i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
          >
            <div className={`p-1.5 rounded-lg ${config.color}`}>
              <Icon className="w-3 h-3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">{config.label}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {event.connector_id} · {event.location_name || event.location_id}
              </p>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <Badge variant="outline" className={`text-[9px] ${STATUS_BADGE[event.status] || STATUS_BADGE.ok}`}>
                {event.status || 'ok'}
              </Badge>
              <p className="text-[10px] text-muted-foreground">{timeAgo(event.timestamp)}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}