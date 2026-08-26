import React, { useState, useMemo } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { useApiPolling } from '@/lib/hooks/useApiPolling';
import { DorsoftAPI } from '@/lib/api-service';
import { demoFallback } from '@/lib/data-source';
import { DEMO_PRODUCTS } from '@/lib/demo-data';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Glasses, TrendingUp, TrendingDown, Minus, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function Rame() {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('revenue');
  const { isAdmin } = useUserRole();

  const { data: products, isLoading } = useApiPolling(
    'products',
    demoFallback('products', DorsoftAPI.getProducts, DEMO_PRODUCTS),
    60000
  );

  const brands = useMemo(() => {
    const set = new Set((products || []).map(p => p.brand).filter(Boolean));
    return Array.from(set).sort();
  }, [products]);

  const categories = useMemo(() => {
    const set = new Set((products || []).map(p => p.category).filter(Boolean));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    let items = [...(products || [])];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(p => 
        p.sku?.toLowerCase().includes(q) || 
        p.brand?.toLowerCase().includes(q) || 
        p.name?.toLowerCase().includes(q)
      );
    }
    if (brandFilter !== 'all') items = items.filter(p => p.brand === brandFilter);
    if (categoryFilter !== 'all') items = items.filter(p => p.category === categoryFilter);
    
    // Sort: out of stock at bottom
    items.sort((a, b) => {
      if (a.stock === 0 && b.stock !== 0) return 1;
      if (a.stock !== 0 && b.stock === 0) return -1;
      if (sortBy === 'revenue') return (b.revenue || 0) - (a.revenue || 0);
      if (sortBy === 'units') return (b.units || 0) - (a.units || 0);
      if (sortBy === 'stock') return (b.stock || 0) - (a.stock || 0);
      return 0;
    });
    return items;
  }, [products, search, brandFilter, categoryFilter, sortBy]);

  return (
    <div className="space-y-5">
      <PageHeader title="Rame" subtitle={`${formatNumber(products?.length || 0)} produse în catalog`} />

      {/* Filters */}
      <div className="glass rounded-xl p-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Caută SKU, brand, model..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-transparent border-0 focus-visible:ring-0"
          />
        </div>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-full sm:w-36 bg-transparent border-0"><SelectValue placeholder="Brand" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate brandurile</SelectItem>
            {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-36 bg-transparent border-0"><SelectValue placeholder="Categorie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate categoriile</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-36 bg-transparent border-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Venit</SelectItem>
            <SelectItem value="units">Unități</SelectItem>
            <SelectItem value="stock">Stoc</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 space-y-3">
              <div className="h-32 shimmer rounded-lg" />
              <div className="h-4 w-3/4 shimmer rounded" />
              <div className="h-3 w-1/2 shimmer rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((product, i) => (
              <motion.div
                key={product.sku || i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <Link to={`/rame/${product.sku}`} className="block">
                  <div className={`glass rounded-xl p-4 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group ${product.stock === 0 ? 'fade-out-stock' : ''}`}>
                    <div className="h-28 rounded-lg bg-muted/40 flex items-center justify-center mb-3 group-hover:bg-muted/60 transition-colors">
                      <Glasses className="w-10 h-10 text-muted-foreground/40" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px]">{product.sku}</Badge>
                        {product.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                        {product.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                        {product.trend === 'stable' && <Minus className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      <h3 className="text-sm font-semibold truncate">{product.brand} {product.name}</h3>
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-sm font-bold">{formatCurrency(product.price)}</span>
                        <span className={`text-xs font-medium flex items-center gap-1 ${product.stock === 0 ? 'text-destructive' : product.stock <= 3 ? 'text-warning' : 'text-muted-foreground'}`}>
                          <Package className="w-3 h-3" />
                          {product.stock} buc
                        </span>
                      </div>
                      {isAdmin && product.cost_price && (
                        <p className="text-[10px] text-muted-foreground">Cost: {formatCurrency(product.cost_price)}</p>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}