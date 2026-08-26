// Demo data for when the bridge API is not available
// This allows the app to show realistic data during development

export const DEMO_DASHBOARD = {
  total_products: 2847,
  total_stock_value: 1245680,
  total_cost_value: 623400,
  sales_today: 14520,
  sales_today_units: 12,
  sales_week: 87340,
  sales_month: 342890,
  products_sold_today: 12,
  out_of_stock: 43,
  critical_stock: 67,
  best_store: "Argeș Mall",
  top_brand: "Ray-Ban",
  average_receipt: 1210,
  evolution_vs_last_month: 12.4,
  shopify_orders: 8,
  shopify_revenue: 9640,
  trending_products: 15,
  declining_products: 7,
  estimated_profit: 167230,
  estimated_margin: 48.7,
  last_updated: new Date().toISOString()
};

export const DEMO_DAILY_SALES = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  return {
    date: date.toISOString().split('T')[0],
    revenue: Math.floor(8000 + Math.random() * 12000),
    units: Math.floor(5 + Math.random() * 20),
    orders: Math.floor(3 + Math.random() * 15)
  };
});

export const DEMO_TOP_PRODUCTS = [
  { sku: "RB-3025-001", brand: "Ray-Ban", name: "Aviator Classic", revenue: 45600, units: 38, trend: "up", stock: 12 },
  { sku: "OA-8046-01", brand: "Oakley", name: "Holbrook", revenue: 38200, units: 29, trend: "up", stock: 8 },
  { sku: "PR-09XS-1AB", brand: "Prada", name: "Conceptual", revenue: 34100, units: 15, trend: "stable", stock: 5 },
  { sku: "TF-5146-001", brand: "Tom Ford", name: "Square", revenue: 31800, units: 11, trend: "up", stock: 3 },
  { sku: "GC-0036S-001", brand: "Gucci", name: "Round", revenue: 28900, units: 13, trend: "down", stock: 7 },
  { sku: "RB-4171-622", brand: "Ray-Ban", name: "Erika", revenue: 26400, units: 33, trend: "up", stock: 15 },
  { sku: "VE-4361-GB1", brand: "Versace", name: "Medusa", revenue: 23100, units: 9, trend: "stable", stock: 4 },
  { sku: "DG-4268-501", brand: "Dolce & Gabbana", name: "Classic", revenue: 21600, units: 12, trend: "down", stock: 0 },
  { sku: "AR-8113-5017", brand: "Giorgio Armani", name: "Frames", revenue: 19800, units: 8, trend: "up", stock: 6 },
  { sku: "BB-5012-001", brand: "Burberry", name: "Heritage", revenue: 17500, units: 10, trend: "stable", stock: 2 },
];

export const DEMO_LOCATIONS = [
  { id: 1, name: "Argeș Mall", type: "fizic", sales_today: 6240, sales_month: 145200, units_today: 5, stock_value: 456000, products: 1245 },
  { id: 2, name: "Exercițiu", type: "fizic", sales_today: 4180, sales_month: 98300, units_today: 3, stock_value: 312000, products: 876 },
  { id: 3, name: "I.C. Brătianu", type: "fizic", sales_today: 2460, sales_month: 67800, units_today: 2, stock_value: 287000, products: 726 },
  { id: 4, name: "zof.ro", type: "online", sales_today: 1640, sales_month: 31590, units_today: 2, stock_value: 0, products: 2847 },
];

export const DEMO_ALERTS = [
  { id: 1, type: "critical_stock", severity: "high", message: "Ray-Ban Aviator - stoc critic (2 buc)", product_sku: "RB-3025-001", timestamp: new Date().toISOString() },
  { id: 2, type: "out_of_stock", severity: "high", message: "Tom Ford Square - stoc epuizat", product_sku: "TF-5146-001", timestamp: new Date(Date.now() - 3600000).toISOString() },
  { id: 3, type: "trending", severity: "info", message: "Oakley Holbrook - vânzări +45% față de săptămâna trecută", product_sku: "OA-8046-01", timestamp: new Date(Date.now() - 7200000).toISOString() },
  { id: 4, type: "sales_drop", severity: "medium", message: "Gucci Round - scădere vânzări -30%", product_sku: "GC-0036S-001", timestamp: new Date(Date.now() - 14400000).toISOString() },
  { id: 5, type: "no_sales", severity: "low", message: "Burberry Heritage - fără vânzări de 14 zile", product_sku: "BB-5012-001", timestamp: new Date(Date.now() - 28800000).toISOString() },
];

export const DEMO_MONTHLY_SALES = [
  { month: "Ian", revenue: 245000, units: 198, cost: 122500 },
  { month: "Feb", revenue: 268000, units: 215, cost: 134000 },
  { month: "Mar", revenue: 312000, units: 248, cost: 156000 },
  { month: "Apr", revenue: 298000, units: 237, cost: 149000 },
  { month: "Mai", revenue: 342890, units: 271, cost: 171445 },
];

export const DEMO_BRANDS = [
  { name: "Ray-Ban", revenue: 156800, units: 134, trend: 12.4, products: 245 },
  { name: "Oakley", revenue: 98400, units: 78, trend: 8.2, products: 156 },
  { name: "Prada", revenue: 87200, units: 42, trend: -2.1, products: 89 },
  { name: "Tom Ford", revenue: 76500, units: 31, trend: 15.7, products: 67 },
  { name: "Gucci", revenue: 65300, units: 38, trend: -5.4, products: 54 },
  { name: "Versace", revenue: 54200, units: 28, trend: 3.8, products: 43 },
];

export const DEMO_CATEGORIES = [
  { name: "Bărbați", revenue: 198000, units: 165, percentage: 38 },
  { name: "Femei", revenue: 178000, units: 148, percentage: 34 },
  { name: "Unisex", revenue: 104000, units: 87, percentage: 20 },
  { name: "Copii", revenue: 42000, units: 52, percentage: 8 },
];

export const DEMO_SHOPIFY_ORDERS = [
  { id: "ZOF-1001", date: new Date().toISOString(), customer: "Maria P.", total: 1290, status: "fulfilled", products: ["RB-3025-001"] },
  { id: "ZOF-1002", date: new Date(Date.now() - 3600000).toISOString(), customer: "Andrei M.", total: 2180, status: "pending", products: ["OA-8046-01", "RB-4171-622"] },
  { id: "ZOF-1003", date: new Date(Date.now() - 7200000).toISOString(), customer: "Elena D.", total: 890, status: "fulfilled", products: ["GC-0036S-001"] },
  { id: "ZOF-1004", date: new Date(Date.now() - 86400000).toISOString(), customer: "Ion V.", total: 3450, status: "fulfilled", products: ["PR-09XS-1AB"] },
  { id: "ZOF-1005", date: new Date(Date.now() - 172800000).toISOString(), customer: "Ana S.", total: 1830, status: "shipped", products: ["TF-5146-001"] },
];

export const DEMO_SALES_JOURNAL = Array.from({ length: 50 }, (_, i) => {
  const products = DEMO_TOP_PRODUCTS;
  const locations = ["Argeș Mall", "Exercițiu", "I.C. Brătianu", "zof.ro"];
  const p = products[Math.floor(Math.random() * products.length)];
  const date = new Date();
  date.setHours(date.getHours() - i * 2);
  return {
    id: i + 1,
    timestamp: date.toISOString(),
    product_sku: p.sku,
    product_name: `${p.brand} ${p.name}`,
    brand: p.brand,
    quantity: Math.floor(1 + Math.random() * 3),
    value: Math.floor(400 + Math.random() * 2500),
    location: locations[Math.floor(Math.random() * locations.length)],
    type: Math.random() > 0.2 ? "fizic" : "online"
  };
});

export const DEMO_PERFORMANCE = {
  heatmap: Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 12 }, (_, hour) => ({
      day,
      hour: hour + 8,
      value: Math.floor(Math.random() * 100)
    }))
  ).flat(),
  online_vs_fizic: { online: 31590, fizic: 311300 },
};

export const DEMO_PRODUCTS = DEMO_TOP_PRODUCTS.map((p, i) => ({
  ...p,
  category: ["Bărbați", "Femei", "Unisex", "Copii"][i % 4],
  manufacturer: p.brand,
  size: ["S", "M", "L"][i % 3],
  price: Math.floor(600 + Math.random() * 2400),
  cost_price: Math.floor(300 + Math.random() * 1200),
  status: p.stock > 0 ? "activ" : "epuizat",
  stock_locations: {
    "Argeș Mall": Math.floor(Math.random() * 8),
    "Exercițiu": Math.floor(Math.random() * 6),
    "I.C. Brătianu": Math.floor(Math.random() * 5),
  },
  image_url: null,
}));