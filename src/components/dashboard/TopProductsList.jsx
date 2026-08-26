import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Glasses } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format';

function TrendBadge({ trend }) {
  if (trend === 'up') return <span className="flex items-center gap-0.5 text-emerald-500 text-[10px] font-semibold"><TrendingUp className="w-3 h-3" />Creștere</span>;
  if (trend === 'down') return <span className="flex items-center gap-0.5 text-red-500 text-[10px] font-semibold"><TrendingDown className="w-3 h-3" />Scădere</span>;
  return <span className="flex items-center gap-0.5 text-muted-foreground text-[10px] font-semibold"><Minus className="w-3 h-3" />Stabil</span>;
}

export default function TopProductsList({ products, loading }) {
  if (loading) {
    return (
      <div className="glass rounded-xl p-5">
        <div className="h-4 w-32 shimmer rounded mb-4" />
        <div className="space-y-3">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="h-12 shimmer rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 lg:p-5"
    >
      <h3 className="font-semibold text-sm mb-4">Top produse</h3>
      <div className="space-y-2">
        {(products || []).slice(0, 8).map((product, i) => (
          <div 
            key={product.sku || i} 
            className={`flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors ${product.stock === 0 ? 'fade-out-stock' : ''}`}
          >
            <span className="text-xs font-bold text-muted-foreground w-5 text-right">#{i + 1}</span>
            <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
              <Glasses className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{product.brand} {product.name}</p>
              <p className="text-[10px] text-muted-foreground">{product.sku} • {formatNumber(product.units)} vândute</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold">{formatCurrency(product.revenue)}</p>
              <TrendBadge trend={product.trend} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}