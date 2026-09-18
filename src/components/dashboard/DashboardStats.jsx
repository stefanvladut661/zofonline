import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronRight, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { formatCurrency, formatNumber, formatPercent, formatDay, formatDateRange } from '@/lib/format';

// Cele 15 carduri identice de dinainte aveau toate aceeasi greutate vizuala,
// deci nimic nu iesea in evidenta. Acum: 3 panouri, fiecare cu UN numar mare
// (ce vrea owner-ul sa vada dintr-o privire) si restul ca lista scurta.
//
// Perioadele NU sunt „azi / luna aceasta": datele vin din exportul DorSoft de
// a doua zi, deci serverul le ancoreaza pe ultima zi raportata si ne trimite
// intervalul exact (`data.period`). Il afisam sub fiecare eticheta.

// Nuantele 500 au contrast slab pe fundal alb (~2.5:1 la 14px); pe intunecat sunt ok.
const TONE = {
  destructive: 'text-red-600 dark:text-red-500',
  warning: 'text-amber-700 dark:text-amber-500',
  success: 'text-emerald-700 dark:text-emerald-500',
};

const PROFIT_HINT =
  'Profit estimat = Σ cantitate × (preț de vânzare − preț de achiziție), pe vânzările din perioada afișată, ' +
  'DOAR pentru produsele care au preț de achiziție în catalog. Produsele fără preț de achiziție nu intră în calcul. ' +
  'Estimare brută: nu scade TVA, chirii, salarii.';
const MARGIN_HINT =
  'Marjă estimată = profit estimat ÷ venitul produselor cu preț de achiziție × 100. ' +
  '„pe X% din venit" spune ce parte din vânzări are preț de achiziție cunoscut.';
const PREV_MONTH_HINT =
  'Comparație cu ACEEAȘI perioadă din luna precedentă (de la 1 până la aceeași zi), nu cu luna întreagă — ' +
  'altfel la început de lună ar ieși mereu o scădere mare. Valoarea de după „·" e venitul din acea perioadă.';

function Trend({ value }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const color = value > 0 ? TONE.success : value < 0 ? TONE.destructive : 'text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-0.5 ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {formatPercent(value)}
    </span>
  );
}

function PanelSkeleton() {
  return (
    <div className="glass rounded-xl p-4 lg:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-20 shimmer rounded" />
        <div className="h-3 w-12 shimmer rounded" />
      </div>
      <div className="h-8 w-32 shimmer rounded" />
      <div className="h-3 w-24 shimmer rounded mt-2" />
      <div className="mt-4 space-y-2.5">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="h-4 shimmer rounded" />
        ))}
      </div>
    </div>
  );
}

function Panel({ title, to, hero, rows, loading }) {
  if (loading) return <PanelSkeleton />;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass rounded-xl p-4 lg:p-5 flex flex-col"
      aria-label={title}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Link to={to} className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5">
          Detalii <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <p className={`text-2xl lg:text-3xl font-bold tracking-tight tabular-nums leading-none truncate ${TONE[hero.tone] || ''}`}>
        {hero.value}
      </p>
      <p className="text-xs text-muted-foreground mt-1.5">{hero.caption}</p>

      <dl className="mt-4 border-t border-border/60 divide-y divide-border/60">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-3 py-2 text-sm"
            title={row.hint}
          >
            <dt className="text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                {row.label}
                {row.hint && <Info className="w-3 h-3 opacity-60" aria-label="explicație" />}
              </span>
              {row.period && (
                <span className="block text-[10px] leading-tight text-muted-foreground/80 tabular-nums">{row.period}</span>
              )}
            </dt>
            <dd className={`flex items-center gap-1.5 font-semibold tabular-nums text-right ${TONE[row.tone] || ''}`}>
              {row.trend !== undefined ? <Trend value={row.trend} /> : row.value}
              {row.note && <span className="font-normal text-muted-foreground">· {row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </motion.section>
  );
}

export default function DashboardStats({ data, loading }) {
  const { isAdmin } = useUserRole();

  const outOfStock = data?.out_of_stock ?? 0;
  const critical = data?.critical_stock ?? 0;
  const trendingUp = data?.trending_products ?? 0;
  const trendingDown = data?.declining_products ?? 0;

  const period = data?.period;
  const range = (p) => (p ? formatDateRange(p.from, p.to) : undefined);
  const monthRange = range(period?.month);

  // Servere mai vechi nu trimit `sales_last_day`; cadem pe „azi" ca inainte.
  const lastDayValue = data?.sales_last_day ?? data?.sales_today;
  const lastDayUnits = data?.sales_last_day_units ?? data?.products_sold_today ?? 0;
  const lastDayLabel = period?.last_day ? `ultima zi raportată · ${formatDay(period.last_day.to)}` : 'ultima zi raportată';

  const profit = data?.estimated_profit;
  const marginPct = data?.estimated_margin;
  const coverage = data?.margin_coverage;
  const marginNote = profit == null
    ? 'fără preț de achiziție'
    : coverage != null && coverage < 99.5 ? `pe ${formatNumber(coverage)}% din venit` : undefined;

  const sales = {
    title: 'Vânzări',
    to: '/vanzari',
    hero: { value: formatCurrency(lastDayValue), caption: `${lastDayLabel} · ${formatNumber(lastDayUnits)} produse` },
    rows: [
      { label: 'Ultimele 7 zile', period: range(period?.week), value: formatCurrency(data?.sales_week) },
      { label: 'Luna curentă', period: monthRange, value: formatCurrency(data?.sales_month) },
      {
        label: 'vs luna trecută',
        period: range(period?.prev_month),
        trend: data?.evolution_vs_last_month ?? null,
        note: data?.sales_prev_month != null ? formatCurrency(data.sales_prev_month) : undefined,
        hint: PREV_MONTH_HINT,
      },
      { label: 'Bon mediu', period: monthRange, value: formatCurrency(data?.average_receipt) },
      { label: 'Online (Shopify)', period: monthRange, value: formatCurrency(data?.shopify_revenue), note: `${formatNumber(data?.shopify_orders ?? 0)} comenzi` },
      ...(isAdmin ? [
        { label: 'Profit estimat', period: monthRange, value: profit == null ? '—' : formatCurrency(profit), note: marginNote, hint: PROFIT_HINT },
        { label: 'Marjă estimată', period: monthRange, value: marginPct == null ? '—' : `${formatNumber(marginPct)}%`, note: marginNote, hint: MARGIN_HINT },
      ] : []),
    ],
  };

  const stock = {
    title: 'Stoc',
    to: '/rame',
    hero: { value: formatNumber(data?.total_products), caption: 'produse în stoc' },
    rows: [
      { label: 'Epuizate', value: formatNumber(outOfStock), tone: outOfStock > 0 ? 'destructive' : undefined },
      { label: 'Stoc critic', value: formatNumber(critical), tone: critical > 0 ? 'warning' : undefined },
      ...(isAdmin ? [{ label: 'Valoare stoc', value: formatCurrency(data?.total_stock_value) }] : []),
    ],
  };

  const performance = {
    title: 'Performanță',
    to: '/analytics',
    hero: { value: data?.best_store || '—', caption: monthRange ? `cel mai bun magazin · ${monthRange}` : 'cel mai bun magazin luna aceasta' },
    rows: [
      { label: 'Brand top', period: monthRange, value: data?.top_brand || '—' },
      { label: 'Produse în creștere', period: range(period?.week), value: formatNumber(trendingUp), tone: trendingUp > 0 ? 'success' : undefined },
      { label: 'Produse în scădere', period: range(period?.week), value: formatNumber(trendingDown), tone: trendingDown > 0 ? 'destructive' : undefined },
    ],
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-4 items-start">
      {[sales, stock, performance].map((panel) => (
        <Panel key={panel.title} loading={loading} {...panel} />
      ))}
    </div>
  );
}
