import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/format';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg p-3 shadow-xl text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color }} />
          {p.name === 'revenue' ? formatCurrency(p.value) : formatNumber(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function SalesChart({ data, loading }) {
  const [mode, setMode] = useState('revenue');

  if (loading) {
    return (
      <div className="glass rounded-xl p-5">
        <div className="h-4 w-40 shimmer rounded mb-4" />
        <div className="h-64 shimmer rounded-lg" />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 lg:p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Evoluție vânzări</h3>
        <div className="flex bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setMode('revenue')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'revenue' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
          >
            RON
          </button>
          <button
            onClick={() => setMode('units')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${mode === 'units' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
          >
            Unități
          </button>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis 
              dataKey="date" 
              tickFormatter={(v) => v ? new Date(v).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) : ''}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              tickFormatter={(v) => mode === 'revenue' ? `${(v/1000).toFixed(0)}k` : v}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            {mode === 'revenue' ? (
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(221, 83%, 53%)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
            ) : (
              <Area
                type="monotone"
                dataKey="units"
                stroke="hsl(262, 83%, 58%)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorUnits)"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}