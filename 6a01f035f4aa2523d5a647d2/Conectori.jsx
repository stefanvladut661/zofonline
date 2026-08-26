const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import ConnectorCard from '@/components/conectori/ConnectorCard';
import AddConnectorDialog from '@/components/conectori/AddConnectorDialog';
import ApiKeyRevealDialog from '@/components/conectori/ApiKeyRevealDialog';
import EventLogTable from '@/components/conectori/EventLogTable';
import { useUserRole } from '@/lib/hooks/useUserRole';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createConnector, deleteConnector, checkConnectorStatuses, buildHealthResponse, buildConnectorsResponse } from '@/lib/connector-service';
import { DorsoftAPI, getApiBaseUrl } from '@/lib/api-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Plus, Server, Activity, Database, RefreshCw,
  CheckCircle, XCircle, Loader2, Eye, EyeOff, Zap
} from 'lucide-react';

export default function Conectori() {
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [showHeartbeats, setShowHeartbeats] = useState(false);
  const [newKeyDialog, setNewKeyDialog] = useState(null); // { apiKey, connectorName }
  const [apiHealth, setApiHealth] = useState(null);

  const { data: connectors = [], isLoading } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => db.entities.Connector.list('-created_date'),
    refetchInterval: 15000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['sync-events'],
    queryFn: () => db.entities.SyncEvent.list('-timestamp', 100),
    refetchInterval: 10000,
  });

  // Auto-check connector statuses every 30s
  useEffect(() => {
    const tick = () => checkConnectorStatuses().then(() => queryClient.invalidateQueries({ queryKey: ['connectors'] }));
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const handleAddConnector = async (formData) => {
    setSaving(true);
    try {
      const { connector, apiKey } = await createConnector(formData);
      await queryClient.invalidateQueries({ queryKey: ['connectors'] });
      setAddOpen(false);
      setNewKeyDialog({ apiKey, connectorName: formData.name });
      toast.success(`Connector "${formData.name}" creat cu succes`);
    } catch (err) {
      toast.error(`Eroare: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (connector) => {
    if (!confirm(`Ștergi conectorul "${connector.name}"? Cheia API asociată va fi revocată.`)) return;
    try {
      await deleteConnector(connector.id, connector.connector_id);
      await queryClient.invalidateQueries({ queryKey: ['connectors'] });
      toast.success('Connector șters');
    } catch (err) {
      toast.error(`Eroare: ${err.message}`);
    }
  };

  const handleTestConnection = async (connector) => {
    setTesting(connector.id);
    try {
      const start = Date.now();
      await DorsoftAPI.testConnection();
      const latency = Date.now() - start;
      toast.success(`Conexiune reușită (${latency}ms)`);
      await db.entities.Connector.update(connector.id, { status: 'online', last_heartbeat: new Date().toISOString() });
      await queryClient.invalidateQueries({ queryKey: ['connectors'] });
    } catch {
      toast.error('Conexiune eșuată — bridge-ul nu răspunde');
      await db.entities.Connector.update(connector.id, { status: 'offline' });
    } finally {
      setTesting(null);
    }
  };

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key);
    toast.success('Cheie copiată în clipboard');
  };

  const checkApiHealth = async () => {
    try {
      const start = Date.now();
      await DorsoftAPI.testConnection();
      const health = buildHealthResponse(connectors);
      setApiHealth({ ...health, latency: Date.now() - start, ok: true });
    } catch {
      setApiHealth({ ok: false, status: 'unavailable', timestamp: new Date().toISOString() });
    }
  };

  const toggleDorsoftSync = async (connector, enabled) => {
    await db.entities.Connector.update(connector.id, { dorsoft_sync_enabled: enabled });
    await queryClient.invalidateQueries({ queryKey: ['connectors'] });
  };

  const online = connectors.filter(c => c.status === 'online').length;
  const offline = connectors.filter(c => c.status === 'offline').length;

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Nu aveți acces la gestionarea conectorilor.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Conectori"
        subtitle="Gestionare conectori Dorsoft și surse de date"
        lastUpdated={new Date().toISOString()}
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Adaugă Connector
          </Button>
        }
      />

      {/* Summary bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total conectori', value: connectors.length, icon: Server, color: 'text-primary' },
          { label: 'Online', value: online, icon: Activity, color: 'text-emerald-500' },
          { label: 'Offline', value: offline, icon: XCircle, color: 'text-red-500' },
          { label: 'Evenimente azi', value: events.filter(e => new Date(e.timestamp) > new Date(Date.now() - 86400000)).length, icon: Zap, color: 'text-accent' },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-xl p-4 flex items-center gap-3">
            <stat.icon className={`w-5 h-5 ${stat.color}`} />
            <div>
              <p className="text-lg font-bold">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* API Health */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Status API Bridge</h3>
            <span className="text-[10px] text-muted-foreground font-mono">{getApiBaseUrl()}</span>
          </div>
          <Button variant="outline" size="sm" onClick={checkApiHealth} className="gap-1.5 text-xs">
            <RefreshCw className="w-3 h-3" /> Verifică
          </Button>
        </div>
        {apiHealth && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={`gap-1 text-[10px] ${apiHealth.ok ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-red-500/10 text-red-600 border-red-500/20'}`}>
              {apiHealth.ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {apiHealth.status}
            </Badge>
            {apiHealth.latency && <Badge variant="secondary" className="text-[10px]">{apiHealth.latency}ms latency</Badge>}
            <Badge variant="secondary" className="text-[10px]">{apiHealth.connectors_online || online}/{apiHealth.connectors_total || connectors.length} conectori activi</Badge>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <p className="font-semibold text-foreground text-xs">Endpoint-uri REST disponibile:</p>
          {[
            'GET /api/sync/full',
            'GET /api/sync/incremental?since=timestamp',
            'GET /api/stats/dashboard',
            'GET /api/locations',
            'GET /api/products',
            'GET /api/health',
            'POST /api/heartbeat',
          ].map(ep => (
            <code key={ep} className="block font-mono">{ep}</code>
          ))}
          <p className="mt-2">Autentificare: <code>Authorization: Bearer &lt;API_KEY&gt;</code></p>
        </div>
      </motion.div>

      {/* Connectors grid */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Conectori înregistrați ({connectors.length})</h3>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array(3).fill(0).map((_, i) => <div key={i} className="glass rounded-xl p-4 h-40 shimmer" />)}
          </div>
        ) : connectors.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center text-muted-foreground text-sm">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Niciun connector înregistrat.</p>
            <p className="text-xs mt-1">Adaugă primul connector Dorsoft pentru a începe sincronizarea.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {connectors.map(c => (
              <div key={c.id} className="space-y-2">
                <ConnectorCard
                  connector={c}
                  onDelete={handleDelete}
                  onTestConnection={handleTestConnection}
                  onCopyKey={handleCopyKey}
                  testing={testing}
                />
                <div className="flex items-center gap-2 px-1">
                  <Switch
                    id={`sync-${c.id}`}
                    checked={c.dorsoft_sync_enabled !== false}
                    onCheckedChange={(v) => toggleDorsoftSync(c, v)}
                    className="scale-75"
                  />
                  <Label htmlFor={`sync-${c.id}`} className="text-[11px] text-muted-foreground cursor-pointer">
                    Dorsoft Sync {c.dorsoft_sync_enabled !== false ? 'ON' : 'OFF'}
                  </Label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event log */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Jurnal evenimente</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowHeartbeats(v => !v)} className="gap-1.5 text-xs">
            {showHeartbeats ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showHeartbeats ? 'Ascunde heartbeats' : 'Arată heartbeats'}
          </Button>
        </div>
        <EventLogTable events={events} showHeartbeats={showHeartbeats} />
      </motion.div>

      <AddConnectorDialog open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAddConnector} saving={saving} />
      {newKeyDialog && (
        <ApiKeyRevealDialog
          open={!!newKeyDialog}
          apiKey={newKeyDialog.apiKey}
          connectorName={newKeyDialog.connectorName}
          onClose={() => setNewKeyDialog(null)}
        />
      )}
    </div>
  );
}