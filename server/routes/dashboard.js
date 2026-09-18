import { all, get } from '../db/index.js';

/**
 * Endpoint-urile de citire pentru dashboard.
 *
 * Formele returnate respecta exact contractul pe care il asteapta deja
 * src/lib/api-service.js si componentele — aceleasi chei ca in demo-data.js.
 * Asa, trecerea de pe date demo pe date reale nu cere modificari in UI.
 *
 * Toate calculele pe zile folosesc ora locala a serverului, nu UTC: un bon de
 * la 23:30 trebuie sa cada in ziua in care s-a vandut.
 *
 * PERIOADELE. Datele ajung cu o zi intarziere (exportul DorSoft se face a doua
 * zi), deci „azi" ar fi mereu gol. Toate perioadele se ancoreaza pe ULTIMA ZI
 * CU VANZARI din baza, nu pe ceasul serverului, iar raspunsul contine
 * intervalul exact al fiecareia (`period`), ca dashboard-ul sa-l afiseze in loc
 * de „luna aceasta".
 */

const REVENUE = 'quantity * unit_price';
const DAY = "date(sold_at, 'localtime')";

// ─── Ajutoare ────────────────────────────────────────────────────────────────

const num = (v) => (v == null ? 0 : Number(v));

/** Procent de evolutie fata de o baza; null (nu 0) cand baza e goala — altfel „0%" ar minti. */
const pctChange = (current, previous) =>
  (previous ? Number((((current - previous) / previous) * 100).toFixed(1)) : null);

function criticalThreshold() {
  return num(get('SELECT critical_stock_threshold AS t FROM app_settings WHERE id = ?', 'default')?.t) || 3;
}

// ─── Perioade raportate ──────────────────────────────────────────────────────

/** Ultima zi (locala) cu vanzari; fara vanzari, ziua de azi. */
export function lastReportedDay() {
  return get(`SELECT MAX(${DAY}) AS d FROM sales`)?.d ?? get("SELECT date('now', 'localtime') AS d").d;
}

/**
 * Intervalele afisate pe dashboard, toate inchise ([from, to], zile locale
 * „YYYY-MM-DD"), ancorate pe ultima zi raportata:
 *   last_day    ultima zi raportata
 *   week        ultimele 7 zile, pana la ea inclusiv
 *   month       luna ei, de la 1 pana la ea
 *   prev_month  ACEEASI perioada din luna precedenta (de la 1 pana la aceeasi
 *               zi), ca sa comparam mere cu mere — nu luna intreaga, care pe 5
 *               ale lunii ar arata mereu „-80%". Daca luna precedenta e mai
 *               scurta (31 mar. vs februarie), se opreste la ultima ei zi.
 */
export function reportingPeriods(anchor = lastReportedDay()) {
  // SQLite normalizeaza „31 feb." in „3 mar.", de-aia MIN cu ultima zi a lunii precedente.
  const r = get(`
    SELECT date(?, '-6 days')                                                  AS week_from,
           date(?, 'start of month')                                           AS month_from,
           date(?, 'start of month', '-1 month')                               AS prev_from,
           MIN(date(?, '-1 month'), date(?, 'start of month', '-1 day'))       AS prev_to
  `, anchor, anchor, anchor, anchor, anchor);
  return {
    last_day: { from: anchor, to: anchor },
    week: { from: r.week_from, to: anchor },
    month: { from: r.month_from, to: anchor },
    prev_month: { from: r.prev_from, to: r.prev_to },
  };
}

/** Venit / bucati / bonuri intr-o perioada, optional cu o conditie in plus. */
function periodTotals(p, extra = '') {
  return get(`
    SELECT COALESCE(SUM(${REVENUE}), 0) AS revenue,
           COALESCE(SUM(quantity), 0)   AS units,
           COUNT(DISTINCT source_ref)   AS orders
    FROM sales WHERE ${DAY} BETWEEN ? AND ? ${extra}
  `, p.from, p.to);
}

// ─── Prospetimea datelor ─────────────────────────────────────────────────────

/**
 * Din ce fisiere de export vin datele si de cand sunt, per agent/locatie.
 * `data_as_of` = cel mai nou fisier; UI-ul avertizeaza daca o locatie a ramas
 * in urma. `last_sync_at` e doar cand a rulat puntea ultima data — fara
 * fisier cunoscut (punte veche), e tot ce putem spune.
 */
export function dataFreshness() {
  const sources = all(`
    SELECT s.connector_id, s.location_id, l.name AS location_name,
           s.data_as_of, s.data_source_file, c.last_sync_time
    FROM sync_state s
    LEFT JOIN locations l ON l.id = s.location_id
    LEFT JOIN connectors c ON c.connector_id = s.connector_id
    WHERE s.data_as_of IS NOT NULL OR c.last_sync_time IS NOT NULL
    ORDER BY s.data_as_of DESC, c.last_sync_time DESC
  `).map((r) => ({
    connector_id: r.connector_id,
    location_id: r.location_id,
    location: r.location_name ?? r.location_id,
    file: r.data_source_file,
    as_of: r.data_as_of,
    synced_at: r.last_sync_time,
  }));
  const newest = (key) => sources.map((s) => s[key]).filter(Boolean).sort().at(-1) ?? null;
  return { data_as_of: newest('as_of'), last_sync_at: newest('synced_at'), data_sources: sources };
}

// ─── /api/dashboard ──────────────────────────────────────────────────────────

export function getDashboard() {
  const threshold = criticalThreshold();
  const period = reportingPeriods();
  const todayOnly = get("SELECT date('now', 'localtime') AS d").d;

  const stock = get(`
    SELECT
      COUNT(DISTINCT p.sku)                        AS total_products,
      COALESCE(SUM(i.quantity * p.price), 0)       AS total_stock_value,
      COALESCE(SUM(i.quantity * p.cost_price), 0)  AS total_cost_value
    FROM products p
    LEFT JOIN inventory i ON i.sku = p.sku
  `);

  const today = periodTotals({ from: todayOnly, to: todayOnly });
  const lastDay = periodTotals(period.last_day);
  const week = periodTotals(period.week);
  const month = periodTotals(period.month);
  const prevMonth = periodTotals(period.prev_month);
  const onlineMonth = periodTotals(period.month, "AND channel = 'online'");
  const onlinePrevMonth = periodTotals(period.prev_month, "AND channel = 'online'");

  const stockCounts = get(`
    SELECT
      COALESCE(SUM(CASE WHEN q = 0 THEN 1 ELSE 0 END), 0)                  AS out_of_stock,
      COALESCE(SUM(CASE WHEN q > 0 AND q <= ? THEN 1 ELSE 0 END), 0)       AS critical_stock
    FROM (SELECT sku, COALESCE(SUM(quantity), 0) AS q FROM inventory GROUP BY sku)
  `, threshold);

  const bestStore = get(`
    SELECT l.name FROM sales s JOIN locations l ON l.id = s.location_id
    WHERE date(s.sold_at, 'localtime') BETWEEN ? AND ?
    GROUP BY l.id ORDER BY SUM(${REVENUE}) DESC LIMIT 1
  `, period.month.from, period.month.to);

  const topBrand = get(`
    SELECT p.brand FROM sales s JOIN products p ON p.sku = s.sku
    WHERE p.brand IS NOT NULL AND date(s.sold_at, 'localtime') BETWEEN ? AND ?
    GROUP BY p.brand ORDER BY SUM(${REVENUE}) DESC LIMIT 1
  `, period.month.from, period.month.to);

  // Profitul se poate estima DOAR pe liniile al caror produs are pret de
  // achizitie. Restul nu se numara ca profit 100% — inainte asa se facea, iar
  // cum puntea DorSoft nu trimite cost_price, „marja" iesea mereu 100%.
  // `covered_revenue` spune pe ce parte din venit se bazeaza estimarea.
  const margin = get(`
    SELECT COALESCE(SUM(CASE WHEN p.cost_price IS NOT NULL
                             THEN s.quantity * (s.unit_price - p.cost_price) END), 0) AS profit,
           COALESCE(SUM(CASE WHEN p.cost_price IS NOT NULL THEN ${REVENUE} END), 0)   AS covered_revenue,
           COALESCE(SUM(${REVENUE}), 0)                                              AS revenue
    FROM sales s LEFT JOIN products p ON p.sku = s.sku
    WHERE date(s.sold_at, 'localtime') BETWEEN ? AND ?
  `, period.month.from, period.month.to);

  const trends = getTrendCounts(period.last_day.to);

  const monthRevenue = num(month.revenue);
  const profit = num(margin.profit);
  const coveredRevenue = num(margin.covered_revenue);
  const marginCoverage = num(margin.revenue) ? (coveredRevenue / num(margin.revenue)) * 100 : 0;

  return {
    total_products: num(stock.total_products),
    total_stock_value: Math.round(num(stock.total_stock_value)),
    total_cost_value: Math.round(num(stock.total_cost_value)),
    sales_today: Math.round(num(today.revenue)),
    sales_today_units: num(today.units),
    products_sold_today: num(today.units),
    sales_last_day: Math.round(num(lastDay.revenue)),
    sales_last_day_units: num(lastDay.units),
    sales_week: Math.round(num(week.revenue)),
    sales_month: Math.round(monthRevenue),
    sales_prev_month: Math.round(num(prevMonth.revenue)),
    out_of_stock: num(stockCounts.out_of_stock),
    critical_stock: num(stockCounts.critical_stock),
    best_store: bestStore?.name ?? null,
    top_brand: topBrand?.brand ?? null,
    average_receipt: num(month.orders) ? Math.round(monthRevenue / num(month.orders)) : 0,
    evolution_vs_last_month: pctChange(monthRevenue, num(prevMonth.revenue)),
    shopify_orders: num(onlineMonth.orders),
    shopify_revenue: Math.round(num(onlineMonth.revenue)),
    shopify_orders_prev_month: num(onlinePrevMonth.orders),
    shopify_revenue_prev_month: Math.round(num(onlinePrevMonth.revenue)),
    shopify_evolution_vs_last_month: pctChange(num(onlineMonth.revenue), num(onlinePrevMonth.revenue)),
    trending_products: trends.up,
    declining_products: trends.down,
    estimated_profit: coveredRevenue ? Math.round(profit) : null,
    estimated_margin: coveredRevenue ? Number(((profit / coveredRevenue) * 100).toFixed(1)) : null,
    margin_coverage: Number(marginCoverage.toFixed(1)),
    period,
    ...dataFreshness(),
    last_updated: new Date().toISOString(),
  };
}

/** Compara ultimele 7 zile (pana la ziua ancora inclusiv) cu cele 7 dinainte, per SKU. */
function skuTrendRows(anchor = lastReportedDay()) {
  return all(`
    SELECT sku,
      COALESCE(SUM(CASE WHEN ${DAY} >= date(?, '-6 days') THEN ${REVENUE} ELSE 0 END), 0)  AS recent,
      COALESCE(SUM(CASE WHEN ${DAY} <  date(?, '-6 days') THEN ${REVENUE} ELSE 0 END), 0)  AS previous
    FROM sales
    WHERE ${DAY} BETWEEN date(?, '-13 days') AND ?
    GROUP BY sku
  `, anchor, anchor, anchor, anchor);
}

function classifyTrend(recent, previous) {
  if (previous === 0) return recent > 0 ? 'up' : 'stable';
  const change = (recent - previous) / previous;
  if (change > 0.1) return 'up';
  if (change < -0.1) return 'down';
  return 'stable';
}

function getTrendCounts(anchor) {
  let up = 0, down = 0;
  for (const r of skuTrendRows(anchor)) {
    const t = classifyTrend(num(r.recent), num(r.previous));
    if (t === 'up') up++;
    else if (t === 'down') down++;
  }
  return { up, down };
}

function trendMap() {
  const map = new Map();
  for (const r of skuTrendRows()) map.set(r.sku, classifyTrend(num(r.recent), num(r.previous)));
  return map;
}

// ─── Serii temporale ─────────────────────────────────────────────────────────

export function getDailySales({ days = 30 } = {}) {
  return all(`
    SELECT date(sold_at, 'localtime')  AS date,
           SUM(${REVENUE})             AS revenue,
           SUM(quantity)               AS units,
           COUNT(DISTINCT source_ref)  AS orders
    FROM sales
    WHERE date(sold_at,'localtime') >= date('now','localtime', ?)
    GROUP BY date ORDER BY date
  `, `-${Math.max(1, Number(days) || 30) - 1} days`)
    .map((r) => ({
      date: r.date,
      revenue: Math.round(num(r.revenue)),
      units: num(r.units),
      orders: num(r.orders),
    }));
}

const MONTHS_RO = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];

export function getMonthlySales({ months = 12 } = {}) {
  return all(`
    SELECT strftime('%Y-%m', s.sold_at, 'localtime') AS ym,
           SUM(${REVENUE})                            AS revenue,
           SUM(s.quantity)                            AS units,
           SUM(s.quantity * COALESCE(p.cost_price,0)) AS cost
    FROM sales s LEFT JOIN products p ON p.sku = s.sku
    WHERE s.sold_at >= datetime('now','localtime', ?)
    GROUP BY ym ORDER BY ym
  `, `-${Math.max(1, Number(months) || 12)} months`)
    .map((r) => ({
      month: MONTHS_RO[Number(r.ym.slice(5, 7)) - 1],
      period: r.ym,
      revenue: Math.round(num(r.revenue)),
      units: num(r.units),
      cost: Math.round(num(r.cost)),
    }));
}

// ─── Produse ─────────────────────────────────────────────────────────────────

export function getTopProducts({ limit = 10 } = {}) {
  const trends = trendMap();
  return all(`
    SELECT p.sku, p.brand, p.name,
           COALESCE(SUM(${REVENUE}), 0) AS revenue,
           COALESCE(SUM(s.quantity), 0) AS units,
           (SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE sku = p.sku) AS stock
    FROM products p JOIN sales s ON s.sku = p.sku
    GROUP BY p.sku ORDER BY revenue DESC LIMIT ?
  `, Math.max(1, Number(limit) || 10))
    .map((r) => ({
      sku: r.sku,
      brand: r.brand,
      name: r.name,
      revenue: Math.round(num(r.revenue)),
      units: num(r.units),
      stock: num(r.stock),
      trend: trends.get(r.sku) ?? 'stable',
    }));
}

export function getProducts() {
  const trends = trendMap();
  const perLocation = all('SELECT i.sku, l.name AS location, i.quantity FROM inventory i JOIN locations l ON l.id = i.location_id');
  const byLocation = new Map();
  for (const r of perLocation) {
    if (!byLocation.has(r.sku)) byLocation.set(r.sku, {});
    byLocation.get(r.sku)[r.location] = num(r.quantity);
  }

  return all(`
    SELECT p.*,
      (SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE sku = p.sku)      AS stock,
      (SELECT COALESCE(SUM(quantity * unit_price),0) FROM sales WHERE sku = p.sku) AS revenue,
      (SELECT COALESCE(SUM(quantity),0) FROM sales WHERE sku = p.sku)           AS units
    FROM products p ORDER BY p.name
  `).map((p) => ({
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    manufacturer: p.brand,
    category: p.category,
    size: p.size,
    price: num(p.price),
    cost_price: num(p.cost_price),
    image_url: p.image_url,
    stock: num(p.stock),
    revenue: Math.round(num(p.revenue)),
    units: num(p.units),
    trend: trends.get(p.sku) ?? 'stable',
    status: num(p.stock) > 0 ? 'activ' : 'epuizat',
    stock_locations: byLocation.get(p.sku) ?? {},
  }));
}

export function getStock() {
  return all(`
    SELECT i.sku, p.name, p.brand, l.id AS location_id, l.name AS location,
           i.quantity, i.updated_at, p.price, p.cost_price
    FROM inventory i
    JOIN locations l ON l.id = i.location_id
    LEFT JOIN products p ON p.sku = i.sku
    ORDER BY p.name, l.name
  `).map((r) => ({ ...r, quantity: num(r.quantity), price: num(r.price), cost_price: num(r.cost_price) }));
}

// ─── Vanzari ─────────────────────────────────────────────────────────────────

export function getSales({ limit = 500 } = {}) {
  return all(`
    SELECT s.id, s.sold_at AS timestamp, s.sku AS product_sku,
           p.name AS product_name_raw, p.brand,
           s.quantity, (s.quantity * s.unit_price) AS value,
           l.name AS location, s.channel AS type, s.source_ref
    FROM sales s
    JOIN locations l ON l.id = s.location_id
    LEFT JOIN products p ON p.sku = s.sku
    ORDER BY s.sold_at DESC LIMIT ?
  `, Math.max(1, Number(limit) || 500))
    .map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      product_sku: r.product_sku,
      product_name: [r.brand, r.product_name_raw].filter(Boolean).join(' ') || r.product_sku,
      brand: r.brand,
      quantity: num(r.quantity),
      value: Math.round(num(r.value)),
      location: r.location,
      type: r.type,
      source_ref: r.source_ref,
    }));
}

// ─── Locatii ─────────────────────────────────────────────────────────────────

export function getLocations() {
  const period = reportingPeriods();
  const { last_day: lastDay, month } = period;
  return all(`
    SELECT l.id, l.name, l.type,
      (SELECT COALESCE(SUM(quantity * unit_price),0) FROM sales
        WHERE location_id = l.id AND ${DAY} = date('now','localtime')) AS sales_today,
      (SELECT COALESCE(SUM(quantity),0) FROM sales
        WHERE location_id = l.id AND ${DAY} = date('now','localtime')) AS units_today,
      (SELECT COALESCE(SUM(quantity * unit_price),0) FROM sales
        WHERE location_id = l.id AND ${DAY} BETWEEN ? AND ?) AS sales_last_day,
      (SELECT COALESCE(SUM(quantity),0) FROM sales
        WHERE location_id = l.id AND ${DAY} BETWEEN ? AND ?) AS units_last_day,
      (SELECT COALESCE(SUM(quantity * unit_price),0) FROM sales
        WHERE location_id = l.id AND ${DAY} BETWEEN ? AND ?) AS sales_month,
      (SELECT COALESCE(SUM(i.quantity * p.price),0) FROM inventory i
        LEFT JOIN products p ON p.sku = i.sku WHERE i.location_id = l.id) AS stock_value,
      (SELECT COUNT(*) FROM inventory WHERE location_id = l.id AND quantity > 0) AS products
    FROM locations l WHERE l.is_active = 1 ORDER BY l.name
  `, lastDay.from, lastDay.to, lastDay.from, lastDay.to, month.from, month.to).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    sales_today: Math.round(num(r.sales_today)),
    units_today: num(r.units_today),
    sales_last_day: Math.round(num(r.sales_last_day)),
    units_last_day: num(r.units_last_day),
    sales_month: Math.round(num(r.sales_month)),
    stock_value: Math.round(num(r.stock_value)),
    products: num(r.products),
    period,
  }));
}

// ─── Alerte (calculate, nu stocate) ──────────────────────────────────────────

export function getAlerts() {
  const threshold = criticalThreshold();
  const now = new Date().toISOString();
  const alerts = [];

  for (const r of all(`
    SELECT p.sku, p.name, p.brand, COALESCE(SUM(i.quantity),0) AS q
    FROM products p LEFT JOIN inventory i ON i.sku = p.sku
    GROUP BY p.sku HAVING q <= ? ORDER BY q, p.name LIMIT 50
  `, threshold)) {
    const label = [r.brand, r.name].filter(Boolean).join(' ') || r.sku;
    alerts.push(num(r.q) === 0
      ? { id: `oos-${r.sku}`, type: 'out_of_stock', severity: 'high', message: `${label} — stoc epuizat`, product_sku: r.sku, timestamp: now }
      : { id: `crit-${r.sku}`, type: 'critical_stock', severity: 'high', message: `${label} — stoc critic (${num(r.q)} buc)`, product_sku: r.sku, timestamp: now });
  }

  for (const r of skuTrendRows()) {
    const recent = num(r.recent), previous = num(r.previous);
    if (previous === 0) continue;
    const change = ((recent - previous) / previous) * 100;
    const p = get('SELECT name, brand FROM products WHERE sku = ?', r.sku);
    const label = [p?.brand, p?.name].filter(Boolean).join(' ') || r.sku;
    if (change >= 40) {
      alerts.push({ id: `up-${r.sku}`, type: 'trending', severity: 'info', message: `${label} — vânzări +${change.toFixed(0)}% față de săptămâna trecută`, product_sku: r.sku, timestamp: now });
    } else if (change <= -30) {
      alerts.push({ id: `down-${r.sku}`, type: 'sales_drop', severity: 'medium', message: `${label} — scădere vânzări ${change.toFixed(0)}%`, product_sku: r.sku, timestamp: now });
    }
  }

  for (const r of all(`
    SELECT p.sku, p.name, p.brand,
      (SELECT MAX(sold_at) FROM sales WHERE sku = p.sku) AS last_sold
    FROM products p
    WHERE (SELECT COALESCE(SUM(quantity),0) FROM inventory WHERE sku = p.sku) > 0
      AND (last_sold IS NULL OR date(last_sold,'localtime') < date('now','localtime','-14 days'))
    LIMIT 20
  `)) {
    const label = [r.brand, r.name].filter(Boolean).join(' ') || r.sku;
    alerts.push({ id: `idle-${r.sku}`, type: 'no_sales', severity: 'low', message: `${label} — fără vânzări de 14 zile`, product_sku: r.sku, timestamp: now });
  }

  const rank = { high: 0, medium: 1, info: 2, low: 3 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ─── Analitice ───────────────────────────────────────────────────────────────

export function getBrands() {
  const { month, prev_month: prevMonth } = reportingPeriods();
  const trends = all(`
    SELECT p.brand,
      COALESCE(SUM(CASE WHEN date(s.sold_at,'localtime') BETWEEN ? AND ? THEN ${REVENUE} ELSE 0 END),0) AS cur,
      COALESCE(SUM(CASE WHEN date(s.sold_at,'localtime') BETWEEN ? AND ? THEN ${REVENUE} ELSE 0 END),0) AS prev
    FROM sales s JOIN products p ON p.sku = s.sku WHERE p.brand IS NOT NULL GROUP BY p.brand
  `, month.from, month.to, prevMonth.from, prevMonth.to);
  const trendByBrand = new Map(trends.map((r) => [r.brand, pctChange(num(r.cur), num(r.prev)) ?? 0]));

  return all(`
    SELECT p.brand AS name,
           COALESCE(SUM(${REVENUE}),0)   AS revenue,
           COALESCE(SUM(s.quantity),0)   AS units,
           COUNT(DISTINCT p.sku)         AS products
    FROM products p LEFT JOIN sales s ON s.sku = p.sku
    WHERE p.brand IS NOT NULL GROUP BY p.brand ORDER BY revenue DESC
  `).map((r) => ({
    name: r.name,
    revenue: Math.round(num(r.revenue)),
    units: num(r.units),
    products: num(r.products),
    trend: trendByBrand.get(r.name) ?? 0,
  }));
}

export function getCategories() {
  const rows = all(`
    SELECT p.category AS name,
           COALESCE(SUM(${REVENUE}),0) AS revenue,
           COALESCE(SUM(s.quantity),0) AS units
    FROM products p LEFT JOIN sales s ON s.sku = p.sku
    WHERE p.category IS NOT NULL GROUP BY p.category ORDER BY revenue DESC
  `);
  const total = rows.reduce((sum, r) => sum + num(r.revenue), 0);
  return rows.map((r) => ({
    name: r.name,
    revenue: Math.round(num(r.revenue)),
    units: num(r.units),
    percentage: total ? Math.round((num(r.revenue) / total) * 100) : 0,
  }));
}

export function getPerformance() {
  const period = reportingPeriods();
  const { month } = period;

  // SQLite: %w = 0 (duminica)..6. UI-ul asteapta 0 = luni.
  const rows = all(`
    SELECT ((CAST(strftime('%w', sold_at,'localtime') AS INTEGER) + 6) % 7) AS day,
           CAST(strftime('%H', sold_at,'localtime') AS INTEGER)             AS hour,
           COALESCE(SUM(${REVENUE}),0)                                      AS value
    FROM sales
    WHERE ${DAY} BETWEEN date(?, '-89 days') AND ?
    GROUP BY day, hour
  `, month.to, month.to);

  const split = get(`
    SELECT COALESCE(SUM(CASE WHEN channel='online' THEN ${REVENUE} ELSE 0 END),0) AS online,
           COALESCE(SUM(CASE WHEN channel='fizic'  THEN ${REVENUE} ELSE 0 END),0) AS fizic
    FROM sales WHERE ${DAY} BETWEEN ? AND ?
  `, month.from, month.to);

  // Vanzarile lunii, per locatie (fiecare magazin + online), cu ponderea in total.
  const perLocation = all(`
    SELECT l.id, l.name, l.type,
           COALESCE(SUM(${REVENUE}), 0)  AS revenue,
           COALESCE(SUM(s.quantity), 0)  AS units,
           COUNT(DISTINCT s.source_ref)  AS orders
    FROM locations l
    LEFT JOIN sales s ON s.location_id = l.id AND date(s.sold_at,'localtime') BETWEEN ? AND ?
    WHERE l.is_active = 1
    GROUP BY l.id ORDER BY revenue DESC, l.name
  `, month.from, month.to);
  const totalRevenue = perLocation.reduce((sum, r) => sum + num(r.revenue), 0);

  return {
    heatmap: rows.map((r) => ({ day: num(r.day), hour: num(r.hour), value: Math.round(num(r.value)) })),
    online_vs_fizic: { online: Math.round(num(split.online)), fizic: Math.round(num(split.fizic)) },
    by_location: perLocation.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      revenue: Math.round(num(r.revenue)),
      units: num(r.units),
      orders: num(r.orders),
      share: totalRevenue ? Number(((num(r.revenue) / totalRevenue) * 100).toFixed(1)) : 0,
    })),
    period,
  };
}

/**
 * Comenzile din magazinul online.
 * Pana la integrarea Shopify (Faza 4) sursa sunt vanzarile marcate channel='online'.
 */
export function getShopifyOrders({ limit = 100 } = {}) {
  return all(`
    SELECT s.source_ref AS id, s.sold_at AS date,
           SUM(${REVENUE}) AS total,
           GROUP_CONCAT(s.sku) AS skus
    FROM sales s WHERE s.channel = 'online'
    GROUP BY s.source_ref ORDER BY s.sold_at DESC LIMIT ?
  `, Math.max(1, Number(limit) || 100))
    .map((r) => ({
      id: r.id,
      date: r.date,
      customer: null, // GDPR: fara date de client in dashboard (plan.md §9)
      total: Math.round(num(r.total)),
      status: 'fulfilled',
      products: (r.skus ?? '').split(',').filter(Boolean),
    }));
}
