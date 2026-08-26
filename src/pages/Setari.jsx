const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { DorsoftAPI, setApiBaseUrl, getApiBaseUrl } from '@/lib/api-service';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Wifi, WifiOff, Settings, Globe, Clock, Database,
  CheckCircle, XCircle, Loader2, Save, RefreshCw, MapPin
} from 'lucide-react';

export default function Setari() {
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();

  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const [refreshDash, setRefreshDash] = useState(15);
  const [refreshCharts, setRefreshCharts] = useState(30);
  const [refreshReports, setRefreshReports] = useState(60);
  const [shopifyUrl, setShopifyUrl] = useState('');
  const [shopifyKey, setShopifyKey] = useState('');
  const [shopifyToken, setShopifyToken] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [testing, setTesting] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => db.entities.AppSettings.list(),
    initialData: [],
  });

  useEffect(() => {
    if (settings?.length > 0) {
      const s = settings[0];
      if (s.api_base_url) { setApiUrl(s.api_base_url); setApiBaseUrl(s.api_base_url); }
      if (s.refresh_dashboard) setRefreshDash(s.refresh_dashboard);
      if (s.refresh_charts) setRefreshCharts(s.refresh_charts);
      if (s.refresh_reports) setRefreshReports(s.refresh_reports);
      if (s.shopify_store_url) setShopifyUrl(s.shopify_store_url);
      if (s.shopify_api_key) setShopifyKey(s.shopify_api_key);
      if (s.shopify_access_token) setShopifyToken(s.shopify_access_token);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (settings?.length > 0) {
        return db.entities.AppSettings.update(settings[0].id, data);
      }
      return db.entities.AppSettings.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('Setări salvate cu succes');
    },
  });

  const handleSave = () => {
    setApiBaseUrl(apiUrl);
    saveMutation.mutate({
      api_base_url: apiUrl,
      refresh_dashboard: refreshDash,
      refresh_charts: refreshCharts,
      refresh_reports: refreshReports,
      shopify_store_url: shopifyUrl,
      shopify_api_key: shopifyKey,
      shopify_access_token: shopifyToken,
    });
  };

  const testConnection = async () => {
    setTesting(true);
    setConnectionStatus(null);
    try {
      setApiBaseUrl(apiUrl);
      const result = await DorsoftAPI.testConnection();
      setConnectionStatus({ ok: true, latency: result.latency });
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

      {/* API Bridge */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Dorsoft Bridge API</h3>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">URL API Bridge</Label>
            <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="http://localhost:3001/api" className="mt-1" />
          </div>
          <div className="flex gap-2">
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
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Refresh dashboard (s)</Label>
            <Input type="number" value={refreshDash} onChange={e => setRefreshDash(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Refresh grafice (s)</Label>
            <Input type="number" value={refreshCharts} onChange={e => setRefreshCharts(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Refresh rapoarte (s)</Label>
            <Input type="number" value={refreshReports} onChange={e => setRefreshReports(Number(e.target.value))} className="mt-1" />
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
            <Label className="text-xs">URL Magazin Shopify</Label>
            <Input value={shopifyUrl} onChange={e => setShopifyUrl(e.target.value)} placeholder="https://your-store.myshopify.com" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">API Key</Label>
            <Input value={shopifyKey} onChange={e => setShopifyKey(e.target.value)} placeholder="API Key" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Access Token</Label>
            <Input type="password" value={shopifyToken} onChange={e => setShopifyToken(e.target.value)} placeholder="Access Token" className="mt-1" />
          </div>
        </div>
      </motion.div>

      {/* Locations */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Locații</h3>
        </div>
        <div className="space-y-2">
          {["Argeș Mall", "Exercițiu", "I.C. Brătianu"].map(loc => (
            <div key={loc} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm">{loc}</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">Fizic</Badge>
            </div>
          ))}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-accent" />
              <span className="text-sm">zof.ro</span>
            </div>
            <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent">Online</Badge>
          </div>
        </div>
      </motion.div>

      <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-1.5">
        {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Salvează setări
      </Button>
    </div>
  );
}