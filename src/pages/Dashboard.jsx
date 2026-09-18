import React from 'react';
import PageHeader, { freshnessOf } from '@/components/ui/PageHeader';
import DashboardStats from '@/components/dashboard/DashboardStats';
import SalesChart from '@/components/dashboard/SalesChart';
import TopProductsList from '@/components/dashboard/TopProductsList';
import LocationsOverview from '@/components/dashboard/LocationsOverview';
import AlertsPreview from '@/components/dashboard/AlertsPreview';
import { useApiPolling } from '@/lib/hooks/useApiPolling';
import { ZofAPI } from '@/lib/api-service';
import { demoFallback } from '@/lib/data-source';
import { DEMO_DASHBOARD, DEMO_DAILY_SALES, DEMO_TOP_PRODUCTS, DEMO_LOCATIONS, DEMO_ALERTS } from '@/lib/demo-data';

export default function Dashboard() {
  const { data: dashData, isLoading: loadingDash } = useApiPolling(
    'dashboard',
    demoFallback('dashboard', ZofAPI.getDashboard, DEMO_DASHBOARD),
    15000
  );

  const { data: dailySales, isLoading: loadingSales } = useApiPolling(
    'daily-sales',
    demoFallback('daily-sales', ZofAPI.getDailySales, DEMO_DAILY_SALES),
    30000
  );

  const { data: topProducts, isLoading: loadingTop } = useApiPolling(
    'top-products',
    demoFallback('top-products', ZofAPI.getTopProducts, DEMO_TOP_PRODUCTS),
    30000
  );

  const { data: locations, isLoading: loadingLoc } = useApiPolling(
    'locations',
    demoFallback('locations', ZofAPI.getLocations, DEMO_LOCATIONS),
    30000
  );

  const { data: alerts, isLoading: loadingAlerts } = useApiPolling(
    'alerts',
    demoFallback('alerts', ZofAPI.getAlerts, DEMO_ALERTS),
    30000
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="Zof Optogerman — Prezentare generală"
        freshness={freshnessOf(dashData)}
      />

      <DashboardStats data={dashData} loading={loadingDash} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SalesChart data={dailySales} loading={loadingSales} />
        </div>
        <TopProductsList products={topProducts} loading={loadingTop} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LocationsOverview locations={locations} loading={loadingLoc} period={dashData?.period} />
        <AlertsPreview alerts={alerts} loading={loadingAlerts} />
      </div>
    </div>
  );
}