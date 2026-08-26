import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { useApiPolling } from '@/lib/hooks/useApiPolling';
import { DorsoftAPI } from '@/lib/api-service';
import { DEMO_PRODUCTS, DEMO_DAILY_SALES } from '@/lib/demo-data';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowLeft, Glasses, Package, DollarSign, TrendingUp, MapPin, ShoppingBag } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ProductDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sku = window.location.pathname.split('/rame/')[1];
  const { isAdmin } = useUserRole();

  const { data: products } = useApiPolling('products-detail', async () => {
    try { return await DorsoftAPI.getProducts(); } catch { return DEMO_PRODUCTS; }
  }, 60000);

  const product = (products || []).find(p => p.sku === sku);

  const { data: salesData } = useApiPolling('product-sales', async () => {
    try { return await DorsoftAPI.getDailySales(); } catch { return DEMO_DAILY_SALES; }
  }, 60000);

  if (!product) {
    return (
      <div className="space-y-5">
        <Button variant="ghost" size="sm" onClick={() => navigate('/rame')} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Înapoi la Rame
        </Button>
        <div className="flex items-center justify-center min-h-[40vh]">
          <p className="text-muted-foreground">Produsul nu a fost găsit.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate('/rame')} className="gap-1.5 -ml-2">
        <ArrowLeft className="w-4 h-4" /> Înapoi la Rame
      </Button>

      <div className={`glass rounded-xl p-5 ${product.stock === 0 ? 'fade-out-stock' : ''}`}>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Image */}
          <div className="w-full lg:w-64 h-48 lg:h-64 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
            <Glasses className="w-16 h-16 text-muted-foreground/30" />
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            <div>
              <Badge variant="secondary" className="mb-2">{product.sku}</Badge>
              <h2 className="text-xl font-bold">{product.brand} {product.name}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="outline">{product.category}</Badge>
                <Badge variant="outline">{product.size}</Badge>
                <Badge variant={product.stock > 0 ? 'secondary' : 'destructive'} className="text-xs">
                  {product.stock > 0 ? `${product.stock} în stoc` : 'Stoc epuizat'}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Preț vânzare</p>
                <p className="text-lg font-bold">{formatCurrency(product.price)}</p>
              </div>
              {isAdmin && (
                <div>
                  <p className="text-xs text-muted-foreground">Preț cost</p>
                  <p className="text-lg font-bold">{formatCurrency(product.cost_price)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Venituri generate</p>
                <p className="text-lg font-bold">{formatCurrency(product.revenue)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Unități vândute" value={formatNumber(product.units)} icon={ShoppingBag} />
        <StatCard title="Stoc total" value={formatNumber(product.stock)} icon={Package} />
        <StatCard title="Venituri" value={formatCurrency(product.revenue)} icon={DollarSign} />
        <StatCard title="Trend" value={product.trend === 'up' ? 'Creștere' : product.trend === 'down' ? 'Scădere' : 'Stabil'} icon={TrendingUp} />
      </div>

      {/* Stock by location */}
      {product.stock_locations && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-3">Stoc pe locații</h3>
          <div className="space-y-2">
            {Object.entries(product.stock_locations).map(([loc, qty]) => (
              <div key={loc} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm">{loc}</span>
                </div>
                <span className={`text-sm font-bold ${qty === 0 ? 'text-destructive' : ''}`}>{qty} buc</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Sales chart */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4">Evoluție vânzări</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesData}>
              <defs>
                <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(v) => v ? new Date(v).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) : ''} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip />
              <Area type="monotone" dataKey="units" stroke="hsl(221, 83%, 53%)" strokeWidth={2} fillOpacity={1} fill="url(#colorProd)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}