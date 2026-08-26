import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ZofAPI } from '@/lib/api-service';
import { demoFallback } from '@/lib/data-source';
import { DEMO_ALERTS } from '@/lib/demo-data';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import Footer from './Footer';
import DemoDataBanner from './DemoDataBanner';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  // Badge-ul din meniu arata numarul real de alerte. Inainte era fix 5,
  // hardcodat, cu un comentariu „Will be dynamic".
  // Aceeasi cheie si acelasi fetcher ca pagina Alerte, ca react-query sa
  // partajeze cache-ul in loc sa ceara datele de doua ori.
  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: demoFallback('alerts', ZofAPI.getAlerts, DEMO_ALERTS),
    refetchInterval: 60_000,
    retry: false,
    throwOnError: false,
  });
  const alertCount = alerts.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar 
          collapsed={collapsed} 
          onToggle={() => setCollapsed(!collapsed)} 
          alertCount={alertCount}
        />
      </div>

      {/* Mobile nav */}
      <MobileNav alertCount={alertCount} />

      {/* Main content */}
      <main className={`transition-all duration-300 ${
        collapsed ? 'lg:ml-16' : 'lg:ml-60'
      } pt-14 lg:pt-0 pb-20 lg:pb-0 min-h-screen`}>
        <DemoDataBanner />
        <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
        <Footer />
      </main>
    </div>
  );
}