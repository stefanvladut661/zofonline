import React from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Download, ShoppingBag, Package, BarChart3, TrendingUp, Globe, MapPin } from 'lucide-react';

const REPORTS = [
  { id: 'sales', title: 'Raport vânzări', description: 'Toate tranzacțiile pe perioadă selectată', icon: ShoppingBag, type: 'CSV / Excel' },
  { id: 'stock', title: 'Raport stoc', description: 'Situație stoc complet pe toate locațiile', icon: Package, type: 'CSV / Excel' },
  { id: 'products', title: 'Performanță produse', description: 'Top produse, trenduri, venituri generate', icon: BarChart3, type: 'CSV / PDF' },
  { id: 'trends', title: 'Analiză trenduri', description: 'Produse în creștere, stagnante și în scădere', icon: TrendingUp, type: 'PDF' },
  { id: 'shopify', title: 'Raport Shopify', description: 'Comenzi online, venituri, performanță', icon: Globe, type: 'CSV / Excel' },
  { id: 'locations', title: 'Performanță locații', description: 'Comparație vânzări între magazine', icon: MapPin, type: 'CSV / PDF' },
];

export default function Rapoarte() {
  const handleDownload = (reportId) => {
    // In production, this would call the bridge API to generate the report
    const message = `Raportul "${reportId}" va fi disponibil când bridge-ul API este conectat.`;
    alert(message);
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
            className="glass rounded-xl p-5 hover:shadow-lg hover:shadow-primary/5 transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <report.icon className="w-5 h-5 text-primary" />
              </div>
              <Badge variant="secondary" className="text-[10px]">{report.type}</Badge>
            </div>
            <h3 className="font-semibold text-sm mb-1">{report.title}</h3>
            <p className="text-xs text-muted-foreground mb-4">{report.description}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full gap-1.5"
              onClick={() => handleDownload(report.id)}
            >
              <Download className="w-3.5 h-3.5" /> Descarcă
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}