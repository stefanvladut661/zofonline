import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const ACCENT_STYLES = {
  primary: { bg: 'bg-blue-500/10', hover: 'hover:bg-blue-500/20', text: 'text-blue-500' },
  accent: { bg: 'bg-violet-500/10', hover: 'hover:bg-violet-500/20', text: 'text-violet-500' },
  destructive: { bg: 'bg-red-500/10', hover: 'hover:bg-red-500/20', text: 'text-red-500' },
  warning: { bg: 'bg-amber-500/10', hover: 'hover:bg-amber-500/20', text: 'text-amber-500' },
  success: { bg: 'bg-emerald-500/10', hover: 'hover:bg-emerald-500/20', text: 'text-emerald-500' },
};

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendLabel, accentColor = 'primary', loading }) {
  if (loading) {
    return (
      <div className="glass rounded-xl p-4 lg:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 shimmer rounded" />
          <div className="h-8 w-8 shimmer rounded-lg" />
        </div>
        <div className="h-7 w-28 shimmer rounded" />
        <div className="h-3 w-16 shimmer rounded" />
      </div>
    );
  }

  const trendColor = trend > 0 ? 'text-emerald-500' : trend < 0 ? 'text-red-500' : 'text-muted-foreground';
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const accent = ACCENT_STYLES[accentColor] || ACCENT_STYLES.primary;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass rounded-xl p-4 lg:p-5 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 group"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className={`p-2 rounded-lg ${accent.bg} group-${accent.hover} transition-colors`}>
            <Icon className={`w-4 h-4 ${accent.text}`} />
          </div>
        )}
      </div>
      <div className="animate-counter">
        <p className="text-2xl lg:text-3xl font-bold tracking-tight">{value}</p>
      </div>
      <div className="flex items-center gap-2 mt-2">
        {trend != null && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
        {(subtitle || trendLabel) && (
          <span className="text-xs text-muted-foreground">{trendLabel || subtitle}</span>
        )}
      </div>
    </motion.div>
  );
}