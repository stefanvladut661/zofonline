import React from 'react';
import StatCard from '@/components/ui/StatCard';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { formatCurrency, formatNumber } from '@/lib/format';
import { 
  Package, DollarSign, ShoppingBag, TrendingUp, 
  AlertTriangle, Store, Star, Receipt,
  Globe, Zap, TrendingDown, Target
} from 'lucide-react';

export default function DashboardStats({ data, loading }) {
  const { isAdmin } = useUserRole();

  const stats = [
    { title: "Produse în stoc", value: formatNumber(data?.total_products), icon: Package, accentColor: "primary" },
    { title: "Vânzări azi", value: formatCurrency(data?.sales_today), icon: DollarSign, accentColor: "primary", subtitle: `${data?.products_sold_today || 0} produse` },
    { title: "Vânzări săptămâna", value: formatCurrency(data?.sales_week), icon: ShoppingBag, accentColor: "primary" },
    { title: "Vânzări luna", value: formatCurrency(data?.sales_month), icon: TrendingUp, trend: data?.evolution_vs_last_month, trendLabel: "vs luna trecută" },
    { title: "Produse epuizate", value: formatNumber(data?.out_of_stock), icon: AlertTriangle, accentColor: "destructive" },
    { title: "Stoc critic", value: formatNumber(data?.critical_stock), icon: AlertTriangle, accentColor: "warning" },
    { title: "Cel mai bun magazin", value: data?.best_store || "—", icon: Store, accentColor: "primary" },
    { title: "Top brand", value: data?.top_brand || "—", icon: Star, accentColor: "accent" },
    { title: "Media bonului", value: formatCurrency(data?.average_receipt), icon: Receipt, accentColor: "primary" },
    { title: "Comenzi Shopify", value: formatNumber(data?.shopify_orders), icon: Globe, accentColor: "accent", subtitle: formatCurrency(data?.shopify_revenue) },
    { title: "Produse trending", value: formatNumber(data?.trending_products), icon: Zap, accentColor: "primary" },
    { title: "Produse în scădere", value: formatNumber(data?.declining_products), icon: TrendingDown, accentColor: "destructive" },
  ];

  const adminStats = isAdmin ? [
    { title: "Valoare stoc", value: formatCurrency(data?.total_stock_value), icon: DollarSign, accentColor: "primary" },
    { title: "Profit estimat", value: formatCurrency(data?.estimated_profit), icon: Target, accentColor: "primary" },
    { title: "Marjă estimată", value: data?.estimated_margin ? `${data.estimated_margin}%` : "—", icon: TrendingUp, accentColor: "primary" },
  ] : [];

  const allStats = [...stats, ...adminStats];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
      {allStats.map((stat, i) => (
        <StatCard key={i} loading={loading} {...stat} />
      ))}
    </div>
  );
}