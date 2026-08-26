import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Wifi, Globe, Database, CheckCircle, XCircle, Loader2, Save, MapPin, Plus, AlertTriangle,
} from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { ZofAPI, getApiBaseUrl } from '@/lib/api-service';

export default function Setari() {
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();

  const [refreshDash, setRefreshDash] = useState(15);
  const [refreshCharts, setRefreshCharts] = useState(30);
  const [refreshReports, setRefreshReports] = useState(60);
  const [criticalThreshold, setCriticalThreshold] = useState(3);
  const [shopifyUrl, setShopifyUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: '', type: 'fizic' });

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => ZofAPI.admin.getSettings(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations-admin'],
    queryFn: () => ZofAPI.admin.listLocations(),
  });

  useEffect(() => {
    if (!settings) return;
    setRefreshDash(settings.refresh_dashboard ?? 15);
    setRefreshCharts(settings.refresh_charts ?? 30);
    setRefreshReports(settings.refresh_reports ?? 60);
    setCriticalThreshold(settings.critical_stock_threshold ?? 3);
    setShopifyUrl(settings.shopify_store_url ?? '');
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data) => ZofAPI.admin.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('Setări salvate');
    },
    onError: (err) => toast.error(`Eroare: ${err.message}`),
  });

  const addLocationMutation = useMutation({
    mutationFn: (data) => ZofAPI.admin.createLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations-admin'] });
      setNewLocation({ name: '', type: 'fizic' });
      toast.success('Locație adăugată');
    },
    onError: (err) => toast.error(`Eroare: ${err.message}`),
  });

  const testConnection = async () => {
    setTesting(true);
    setConnectionStatus(null);
    try {
      const result = await ZofAPI.testConnection();
      setConnectionStatus({ ok: true, latency: result.latency, health: result.health });
    } catch (err) {
      setConnectionStatus({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Nu aveți acces la setări.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader title="Setări" subtitle="Configurare aplicație" />

      {/* Server */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Server</h3>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Adresa API</Label>
            {/* Nu e o setare din baza de date: e adresa la care aplicatia insasi
                se conecteaza, fixata la build prin VITE_API_BASE_URL. */}
            <div className="mt-1 px-3 py-2 rounded-md border border-border bg-muted/40 font-mono text-xs text-muted-foreground">
              {getApiBaseUrl()}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Se configurează la build prin <code className="font-mono">VITE_API_BASE_URL</code>.
            </p>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <Button variant="outline" size="sm" onClick={testConnection} disabled={testing} className="gap-1.5">
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
              Testare conexiune
            </Button>
            {connectionStatus && (
              <Badge variant={connectionStatus.ok ? 'secondary' : 'destructive'} className="gap-1">
                {connectionStatus.ok ? (
                  <><CheckCircle className="w-3 h-3" /> Conectat ({connectionStatus.latency}ms)</>
                ) : (
                  <><XCircle className="w-3 h-3" /> Deconectat</>
                )}
              </Badge>
            )}
            {connectionStatus?.ok && (
              <span className="text-[11px] text-muted-foreground">
                {connectionStatus.health.connectors_online}/{connectionStatus.health.connectors_total} agenți online
              </span>
            )}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Refresh dashboard (s)</Label>
            <Input type="number" min="5" value={refreshDash} onChange={(e) => setRefreshDash(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Refresh grafice (s)</Label>
            <Input type="number" min="5" value={refreshCharts} onChange={(e) => setRefreshCharts(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Refresh rapoarte (s)</Label>
            <Input type="number" min="5" value={refreshReports} onChange={(e) => setRefreshReports(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Prag stoc critic</Label>
            <Input type="number" min="0" value={criticalThreshold} onChange={(e) => setCriticalThreshold(Number(e.target.value))} className="mt-1" />
          </div>
        </div>
      </motion.div>

      {/* Shopify */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm">Integrare Shopify</h3>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">URL magazin</Label>
            <Input value={shopifyUrl} onChange={(e) => setShopifyUrl(e.target.value)} placeholder="https://magazin.myshopify.com" className="mt-1" />
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-600">
              API Key și Access Token nu se configurează de aici — sunt secrete și ar
              ajunge în browser. Se pun în variabilele de mediu ale serverului, la
              integrarea Shopify (Faza 4).
            </p>
          </div>
        </div>
      </motion.div>

      {/* Locații */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Locații</h3>
        </div>

        <div className="space-y-2">
          {locations.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              Nicio locație definită. Adaugă prima locație înainte de a înrola un agent.
            </p>
          )}
          {locations.map((loc) => (
            <div key={loc.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                {loc.type === 'online'
                  ? <Globe className="w-3.5 h-3.5 text-accent shrink-0" />
                  : <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />}
                <span className="text-sm truncate">{loc.name}</span>
                <code className="text-[10px] text-muted-foreground font-mono truncate">{loc.id}</code>
              </div>
              <Badge variant={loc.type === 'online' ? 'outline' : 'secondary'} className="text-[10px] shrink-0">
                {loc.type === 'online' ? 'Online' : 'Fizic'}
              </Badge>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Locație nouă</Label>
            <Input
              className="mt-1"
              placeholder="ex: Argeș Mall"
              value={newLocation.name}
              onChange={(e) => setNewLocation((l) => ({ ...l, name: e.target.value }))}
            />
          </div>
          <select
            value={newLocation.type}
            onChange={(e) => setNewLocation((l) => ({ ...l, type: e.target.value }))}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="fizic">Fizic</option>
            <option value="online">Online</option>
          </select>
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={!newLocation.name.trim() || addLocationMutation.isPending}
            onClick={() => addLocationMutation.mutate(newLocation)}
          >
            {addLocationMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Plus className="w-4 h-4" />}
            Adaugă
          </Button>
        </div>
      </motion.div>

      <Button
        onClick={() => saveMutation.mutate({
          refresh_dashboard: refreshDash,
          refresh_charts: refreshCharts,
          refresh_reports: refreshReports,
          critical_stock_threshold: criticalThreshold,
          shopify_store_url: shopifyUrl,
        })}
        disabled={saveMutation.isPending}
        className="gap-1.5"
      >
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvează setări
      </Button>
    </div>
  );
}
