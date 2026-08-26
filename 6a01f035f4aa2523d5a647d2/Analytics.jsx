import React, { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { useApiPolling } from '@/lib/hooks/useApiPolling';
import { DorsoftAPI } from '@/lib/api-service';
import { DEMO_MONTHLY_SALES, DEMO_BRANDS, DEMO_CATEGORIES, DEMO_PERFORMANCE } from '@/lib/demo-data';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

const CHART_COLORS = [
  'hsl(221, 83%, 53%)', 'hsl(262, 83%, 58%)', 'hsl(142, 71%, 45%)', 
  'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(180, 60%, 45%)'
];

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg p-3 shadow-xl text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color }} />
          {p.name}: {typeof p.value === 'number' && p.value > 100 ? formatCurrency(p.value) : formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
};

function ChartCard({ title, children, className = '' }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-xl p-4 lg:p-5 ${className}`}
    >
      <h3 className="font-semibold text-sm mb-4">{title}</h3>
      {children}
    </motion.div>
  );
}

export default function Analytics() {
  const { data: monthlySales } = useApiPolling('monthly-sales', async () => {
    try { return await DorsoftAPI.getMonthlySales(); } catch { return DEMO_MONTHLY_SALES; }
  }, 60000);

  const { data: brands } = useApiPolling('brands', async () => {
    try { return await DorsoftAPI.getBrands(); } catch { return DEMO_BRANDS; }
  }, 60000);

  const { data: categories } = useApiPolling('categories', async () => {
    try { return await DorsoftAPI.getCategories(); } catch { return DEMO_CATEGORIES; }
  }, 60000);

  const { data: performance } = useApiPolling('performance', async () => {
    try { return await DorsoftAPI.getPerformance(); } catch { return DEMO_PERFORMANCE; }
  }, 60000);

  const onlineVsFizic = performance?.online_vs_fizic 
    ? [
        { name: 'Magazine fizice', value: performance.online_vs_fizic.fizic },
        { name: 'Shopify (zof.ro)', value: performance.online_vs_fizic.online }
      ]
    : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" subtitle="Analiză detaliată a performanței" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly revenue */}
        <ChartCard title="Venituri lunare">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" fill="hsl(221, 83%, 53%)" radius={[6, 6, 0, 0]} name="Venit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Online vs Fizic */}
        <ChartCard title="Online vs. Magazine fizice">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={onlineVsFizic}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {onlineVsFizic.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend 
                  verticalAlign="bottom"
                  formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Top brands */}
        <ChartCard title="Analiză branduri — Venituri">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brands} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={80} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" fill="hsl(262, 83%, 58%)" radius={[0, 6, 6, 0]} name="Venit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Categories */}
        <ChartCard title="Analiză categorii">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categories}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="revenue"
                  nameKey="name"
                >
                  {(categories || []).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend 
                  verticalAlign="bottom"
                  formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Brand trends */}
        <ChartCard title="Trenduri branduri" className="lg:col-span-2">
          <div className="space-y-2">
            {(brands || []).map((brand, i) => (
              <div key={brand.name} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                <span className="text-xs font-bold text-muted-foreground w-5 text-right">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{brand.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatNumber(brand.products)} produse • {formatNumber(brand.units)} vândute</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold">{formatCurrency(brand.revenue)}</p>
                  <p className={`text-[10px] font-semibold ${brand.trend > 0 ? 'text-emerald-500' : brand.trend < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {formatPercent(brand.trend)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}