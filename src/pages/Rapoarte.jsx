import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Download, ShoppingBag, Package, BarChart3, TrendingUp, Globe, MapPin, Loader2, FileText,
} from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ZofAPI } from '@/lib/api-service';
import {
  downloadFile, downloadPdf, formatDateTime, timestampSuffix, toCsv,
} from '@/lib/export';

/**
 * Generare de rapoarte.
 *
 * Pagina era in intregime decorativa: sase carduri statice al caror buton facea
 * `alert("Raportul va fi disponibil cand bridge-ul API este conectat")`. Acum
 * fiecare raport isi cere datele de la server si produce un fisier real.
 */

const money = (v) => Math.round(Number(v) || 0);

const REPORTS = [
  {
    id: 'sales',
    title: 'Raport vânzări',
    description: 'Toate tranzacțiile din perioada disponibilă',
    icon: ShoppingBag,
    formats: ['CSV', 'PDF'],
    async load() {
      const rows = await ZofAPI.getSales({ limit: 5000 });
      return {
        rows,
        columns: [
          { key: 'timestamp', label: 'Data', map: (r) => formatDateTime(r.timestamp) },
          { key: 'source_ref', label: 'Referință' },
          { key: 'product_sku', label: 'SKU' },
          { key: 'product_name', label: 'Produs' },
          { key: 'brand', label: 'Brand' },
          { key: 'location', label: 'Locație' },
          { key: 'quantity', label: 'Cantitate' },
          { key: 'value', label: 'Valoare (RON)', map: (r) => money(r.value) },
          { key: 'type', label: 'Canal' },
        ],
        summary: (rows) => [
          `Tranzacții: ${rows.length}`,
          `Total: ${rows.reduce((s, r) => s + money(r.value), 0).toLocaleString('ro-RO')} RON`,
          `Bucăți: ${rows.reduce((s, r) => s + (r.quantity || 0), 0)}`,
        ],
      };
    },
  },
  {
    id: 'stock',
    title: 'Raport stoc',
    description: 'Situația stocului pe toate locațiile',
    icon: Package,
    formats: ['CSV', 'PDF'],
    async load() {
      const rows = await ZofAPI.getStock();
      return {
        rows,
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Produs' },
          { key: 'brand', label: 'Brand' },
          { key: 'location', label: 'Locație' },
          { key: 'quantity', label: 'Cantitate' },
          { key: 'price', label: 'Preț (RON)', map: (r) => money(r.price) },
          { key: 'value', label: 'Valoare (RON)', map: (r) => money(r.quantity * r.price) },
          { key: 'updated_at', label: 'Actualizat', map: (r) => formatDateTime(r.updated_at) },
        ],
        summary: (rows) => [
          `Poziții de stoc: ${rows.length}`,
          `Bucăți: ${rows.reduce((s, r) => s + (r.quantity || 0), 0)}`,
          `Valoare: ${rows.reduce((s, r) => s + money(r.quantity * r.price), 0).toLocaleString('ro-RO')} RON`,
        ],
      };
    },
  },
  {
    id: 'products',
    title: 'Performanță produse',
    description: 'Venituri, bucăți vândute și stoc per produs',
    icon: BarChart3,
    formats: ['CSV', 'PDF'],
    async load() {
      const rows = await ZofAPI.getProducts();
      return {
        rows: [...rows].sort((a, b) => b.revenue - a.revenue),
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Produs' },
          { key: 'brand', label: 'Brand' },
          { key: 'category', label: 'Categorie' },
          { key: 'units', label: 'Bucăți vândute' },
          { key: 'revenue', label: 'Venit (RON)', map: (r) => money(r.revenue) },
          { key: 'stock', label: 'Stoc' },
          { key: 'trend', label: 'Trend' },
          { key: 'status', label: 'Status' },
        ],
        summary: (rows) => [
          `Produse: ${rows.length}`,
          `Fără stoc: ${rows.filter((r) => r.stock === 0).length}`,
          `În creștere: ${rows.filter((r) => r.trend === 'up').length}`,
        ],
      };
    },
  },
  {
    id: 'trends',
    title: 'Analiză trenduri',
    description: 'Produse în creștere, stagnante și în scădere',
    icon: TrendingUp,
    formats: ['CSV', 'PDF'],
    async load() {
      const products = await ZofAPI.getProducts();
      const order = { up: 0, stable: 1, down: 2 };
      return {
        rows: products
          .filter((p) => p.units > 0)
          .sort((a, b) => order[a.trend] - order[b.trend] || b.revenue - a.revenue),
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Produs' },
          { key: 'brand', label: 'Brand' },
          {
            key: 'trend',
            label: 'Trend',
            map: (r) => ({ up: 'Creștere', down: 'Scădere', stable: 'Stabil' })[r.trend] ?? r.trend,
          },
          { key: 'units', label: 'Bucăți' },
          { key: 'revenue', label: 'Venit (RON)', map: (r) => money(r.revenue) },
          { key: 'stock', label: 'Stoc' },
        ],
        summary: (rows) => [
          `În creștere: ${rows.filter((r) => r.trend === 'up').length}`,
          `Stabile: ${rows.filter((r) => r.trend === 'stable').length}`,
          `În scădere: ${rows.filter((r) => r.trend === 'down').length}`,
        ],
      };
    },
  },
  {
    id: 'shopify',
    title: 'Raport online',
    description: 'Comenzi din magazinul online',
    icon: Globe,
    formats: ['CSV', 'PDF'],
    async load() {
      const rows = await ZofAPI.getShopifyOrders({ limit: 2000 });
      return {
        rows,
        columns: [
          { key: 'id', label: 'Comandă' },
          { key: 'date', label: 'Data', map: (r) => formatDateTime(r.date) },
          { key: 'total', label: 'Total (RON)', map: (r) => money(r.total) },
          { key: 'status', label: 'Status' },
          { key: 'products', label: 'SKU-uri', map: (r) => (r.products ?? []).join(', ') },
        ],
        summary: (rows) => [
          `Comenzi: ${rows.length}`,
          `Total: ${rows.reduce((s, r) => s + money(r.total), 0).toLocaleString('ro-RO')} RON`,
        ],
      };
    },
  },
  {
    id: 'locations',
    title: 'Performanță locații',
    description: 'Comparație între magazine',
    icon: MapPin,
    formats: ['CSV', 'PDF'],
    async load() {
      const rows = await ZofAPI.getLocations();
      return {
        rows,
        columns: [
          { key: 'name', label: 'Locație' },
          { key: 'type', label: 'Tip' },
          { key: 'sales_today', label: 'Vânzări azi (RON)' },
          { key: 'units_today', label: 'Bucăți azi' },
          { key: 'sales_month', label: 'Vânzări lună (RON)' },
          { key: 'stock_value', label: 'Valoare stoc (RON)' },
          { key: 'products', label: 'Produse în stoc' },
        ],
        summary: (rows) => [
          `Locații active: ${rows.length}`,
          `Total lună: ${rows.reduce((s, r) => s + money(r.sales_month), 0).toLocaleString('ro-RO')} RON`,
        ],
      };
    },
  },
];

export default function Rapoarte() {
  const [busy, setBusy] = useState(null);

  const generate = async (report, format) => {
    setBusy(`${report.id}-${format}`);
    try {
      const { rows, columns, summary } = await report.load();

      if (!rows.length) {
        toast.warning('Nu există date pentru acest raport încă.');
        return;
      }

      const filename = `zof_${report.id}_${timestampSuffix()}`;

      if (format === 'CSV') {
        downloadFile(`${filename}.csv`, toCsv(columns, rows));
      } else {
        await downloadPdf(`${filename}.pdf`, {
          title: report.title,
          subtitle: `Zof Optogerman · generat ${formatDateTime(new Date())}`,
          columns,
          rows,
          summary: summary?.(rows),
        });
      }

      toast.success(`${report.title} — ${rows.length} rânduri exportate`);
    } catch (err) {
      toast.error(`Nu am putut genera raportul: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Rapoarte" subtitle="Generare și export rapoarte" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORTS.map((report, i) => (
          <motion.div
            key={report.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-xl p-5 flex flex-col hover:shadow-lg hover:shadow-primary/5 transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <report.icon className="w-5 h-5 text-primary" />
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {report.formats.join(' / ')}
              </Badge>
            </div>

            <h3 className="font-semibold text-sm mb-1">{report.title}</h3>
            <p className="text-xs text-muted-foreground mb-4 flex-1">{report.description}</p>

            <div className="flex gap-2">
              {report.formats.map((format) => {
                const key = `${report.id}-${format}`;
                return (
                  <Button
                    key={format}
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    disabled={busy !== null}
                    onClick={() => generate(report, format)}
                  >
                    {busy === key
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : format === 'PDF'
                        ? <FileText className="w-3.5 h-3.5" />
                        : <Download className="w-3.5 h-3.5" />}
                    {format}
                  </Button>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Fișierele CSV se deschid direct în Excel: separator „;", codificare UTF-8 cu BOM,
        zecimale cu virgulă.
      </p>
    </div>
  );
}
