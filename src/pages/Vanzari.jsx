import React, { useState, useMemo } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { useApiPolling } from '@/lib/hooks/useApiPolling';
import { DorsoftAPI } from '@/lib/api-service';
import { DEMO_SALES_JOURNAL } from '@/lib/demo-data';
import { formatCurrency, timeAgo } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Download, MapPin, Globe, ShoppingBag } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Vanzari() {
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const perPage = 20;

  const { data: sales, isLoading } = useApiPolling('sales', async () => {
    try { return await DorsoftAPI.getSales(); } catch { return DEMO_SALES_JOURNAL; }
  }, 30000);

  const filtered = useMemo(() => {
    let items = [...(sales || [])];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(s => 
        s.product_name?.toLowerCase().includes(q) || 
        s.product_sku?.toLowerCase().includes(q) ||
        s.brand?.toLowerCase().includes(q)
      );
    }
    if (locationFilter !== 'all') items = items.filter(s => s.location === locationFilter);
    if (typeFilter !== 'all') items = items.filter(s => s.type === typeFilter);
    return items;
  }, [sales, search, locationFilter, typeFilter]);

  const paged = filtered.slice(0, page * perPage);
  const hasMore = paged.length < filtered.length;

  const locations = useMemo(() => {
    const set = new Set((sales || []).map(s => s.location).filter(Boolean));
    return Array.from(set).sort();
  }, [sales]);

  const handleExport = () => {
    const csv = [
      ['Data', 'Produs', 'SKU', 'Brand', 'Cantitate', 'Valoare', 'Locație', 'Tip'].join(','),
      ...filtered.map(s => [
        new Date(s.timestamp).toLocaleString('ro-RO'),
        `"${s.product_name}"`,
        s.product_sku,
        s.brand,
        s.quantity,
        s.value,
        s.location,
        s.type
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vanzari_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PageHeader 
        title="Jurnal vânzări" 
        subtitle={`${filtered.length} tranzacții`}
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="glass rounded-xl p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Caută produs, SKU, brand..." 
            value={search} 
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 bg-transparent border-0 focus-visible:ring-0"
          />
        </div>
        <Select value={locationFilter} onValueChange={v => { setLocationFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40 bg-transparent border-0"><SelectValue placeholder="Locație" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate locațiile</SelectItem>
            {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-32 bg-transparent border-0"><SelectValue placeholder="Tip" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate</SelectItem>
            <SelectItem value="fizic">Fizic</SelectItem>
            <SelectItem value="online">Online</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sales list */}
      <div className="space-y-2">
        {isLoading ? (
          Array(10).fill(0).map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 h-16 shimmer" />
          ))
        ) : (
          <>
            {paged.map((sale, i) => (
              <motion.div
                key={sale.id || i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass rounded-xl p-3 lg:p-4 flex items-center gap-3 hover:shadow-md transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{sale.product_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{sale.product_sku}</span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground">{sale.quantity}x</span>
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-sm font-bold">{formatCurrency(sale.value)}</p>
                  <div className="flex items-center justify-end gap-1">
                    {sale.type === 'online' ? (
                      <Globe className="w-3 h-3 text-accent" />
                    ) : (
                      <MapPin className="w-3 h-3 text-primary" />
                    )}
                    <span className="text-[10px] text-muted-foreground">{sale.location}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{timeAgo(sale.timestamp)}</p>
                </div>
              </motion.div>
            ))}
            {hasMore && (
              <div className="text-center pt-3">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>
                  Încarcă mai multe
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}