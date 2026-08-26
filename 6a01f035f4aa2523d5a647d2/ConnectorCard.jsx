import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Wifi, WifiOff, MapPin, Globe, Clock, RefreshCw, Trash2, Copy, AlertTriangle } from 'lucide-react';
import { formatNumber, timeAgo } from '@/lib/format';

const STATUS_CONFIG = {
  online: { label: 'Online', icon: Wifi, badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', dot: 'bg-emerald-500' },
  offline: { label: 'Offline', icon: WifiOff, badge: 'bg-red-500/10 text-red-600 border-red-500/20', dot: 'bg-red-500' },
  warning: { label: 'Avertisment', icon: AlertTriangle, badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20', dot: 'bg-amber-500' },
};

export default function ConnectorCard({ connector, onDelete, onTestConnection, onCopyKey, testing }) {
  const status = STATUS_CONFIG[connector.status] || STATUS_CONFIG.offline;
  const StatusIcon = status.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.dot} ${connector.status === 'online' ? 'animate-pulse' : ''}`} />
          <div>
            <p className="text-sm font-semibold">{connector.name}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{connector.connector_id}</p>
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] gap-1 ${status.badge}`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </Badge>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {connector.source_type === 'online' ? <Globe className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
          <span>{connector.location_name || connector.location_id}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <RefreshCw className="w-3 h-3" />
          <span>{formatNumber(connector.sync_count || 0)} sync-uri</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>Heartbeat: {connector.last_heartbeat ? timeAgo(connector.last_heartbeat) : 'niciodată'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>Sync: {connector.last_sync_time ? timeAgo(connector.last_sync_time) : 'niciodată'}</span>
        </div>
      </div>

      {/* Error */}
      {connector.last_error_message && (
        <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20 text-[10px] text-red-500">
          {connector.last_error_message}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => onTestConnection(connector)} disabled={testing === connector.id}>
          {testing === connector.id
            ? <RefreshCw className="w-3 h-3 animate-spin" />
            : <Wifi className="w-3 h-3" />}
          Test
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onCopyKey(connector.api_key)}>
          <Copy className="w-3 h-3" /> Cheie
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => onDelete(connector)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  );
}