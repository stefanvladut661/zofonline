import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import Footer from './Footer';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const alertCount = 5; // Will be dynamic

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
        <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
        <Footer />
      </main>
    </div>
  );
}