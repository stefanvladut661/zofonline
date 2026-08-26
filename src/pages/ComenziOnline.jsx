import React from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { useApiPolling } from '@/lib/hooks/useApiPolling';
import { DorsoftAPI } from '@/lib/api-service';
import { demoFallback } from '@/lib/data-source';
import { DEMO_SHOPIFY_ORDERS, DEMO_DASHBOARD } from '@/lib/demo-data';
import { formatCurrency, timeAgo } from '@/lib/format';
import StatCard from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Globe, Package, Clock, CheckCircle, Truck, ShoppingBag, DollarSign, TrendingUp } from 'lucide-react';

const STATUS_MAP = {
  fulfilled: { label: 'Finalizată', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle },
  pending: { label: 'În așteptare', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Clock },
  shipped: { label: 'Expediată', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Truck },
};

export default function ComenziOnline() {
  const { data: orders, isLoading: loadingOrders } = useApiPolling(
    'shopify-orders',
    demoFallback('shopify-orders', DorsoftAPI.getShopifyOrders, DEMO_SHOPIFY_ORDERS),
    30000);

  const { data: dash } = useApiPolling(
    'dashboard-shopify',
    demoFallback('dashboard-shopify', DorsoftAPI.getDashboard, DEMO_DASHBOARD),
    30000);

  const pendingCount = (orders || []).filter(o => o.status === 'pending').length;

  return (
    <div className="space-y-5">
      <PageHeader 
        title="Comenzi Online" 
        subtitle="Shopify — zof.ro"
        lastUpdated={new Date().toISOString()}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Comenzi azi" value={dash?.shopify_orders || 0} icon={ShoppingBag} />
        <StatCard title="Venit online" value={formatCurrency(dash?.shopify_revenue)} icon={DollarSign} />
        <StatCard title="În așteptare" value={pendingCount} icon={Clock} accentColor="warning" />
        <StatCard title="Evoluție" value={`+${dash?.evolution_vs_last_month || 0}%`} icon={TrendingUp} />
      </div>

      <div className="space-y-2">
        {loadingOrders ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 h-20 shimmer" />
          ))
        ) : (
          (orders || []).map((order, i) => {
            const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.pending;
            const StatusIcon = statusInfo.icon;
            return (
              <motion.div
                key={order.id || i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass rounded-xl p-4 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{order.id}</p>
                      <p className="text-xs text-muted-foreground">{order.customer} • {timeAgo(order.date)}</p>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm font-bold">{formatCurrency(order.total)}</p>
                    <Badge variant="outline" className={`text-[10px] ${statusInfo.color} gap-0.5`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusInfo.label}
                    </Badge>
                  </div>
                </div>
                {order.products?.length > 0 && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {order.products.map((sku, j) => (
                      <Badge key={j} variant="secondary" className="text-[10px]">
                        <Package className="w-2.5 h-2.5 mr-0.5" />{sku}
                      </Badge>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}