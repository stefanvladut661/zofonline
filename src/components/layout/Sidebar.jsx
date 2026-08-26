import React, { useState } from 'react';
import { useTheme } from '@/lib/hooks/useTheme';
import { useUserRole } from '@/lib/hooks/useUserRole';
import { useAuth } from '@/lib/AuthContext';

import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Glasses, BarChart3, ShoppingCart, 
  Globe, FileText, Bell, Settings, ChevronLeft, ChevronRight,
  Moon, Sun, LogOut, Server
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/rame', icon: Glasses, label: 'Rame' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/vanzari', icon: ShoppingCart, label: 'Vânzări' },
  { path: '/comenzi-online', icon: Globe, label: 'Comenzi Online' },
  { path: '/rapoarte', icon: FileText, label: 'Rapoarte' },
  { path: '/alerte', icon: Bell, label: 'Alerte', badge: true },
  { path: '/conectori', icon: Server, label: 'Conectori', adminOnly: true },
  { path: '/setari', icon: Settings, label: 'Setări', adminOnly: true },
];

export default function Sidebar({ collapsed, onToggle, alertCount = 0 }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isAdmin } = useUserRole();
  const { logout } = useAuth();

  const filteredItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside className={`fixed left-0 top-0 h-full z-40 glass-strong transition-all duration-300 flex flex-col ${collapsed ? 'w-16' : 'w-60'}`}>
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-border/50">
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">Z</span>
            </div>
            <div>
              <h1 className="font-bold text-sm leading-none">Zof Stoc Online</h1>
              <p className="text-[10px] text-muted-foreground">Business Intelligence</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground font-bold text-sm">Z</span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {filteredItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative group ${
                isActive 
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" style={{ width: 18, height: 18 }} />
              {!collapsed && <span>{item.label}</span>}
              {item.badge && alertCount > 0 && (
                <span className={`absolute ${collapsed ? '-top-1 -right-1' : 'right-3'} min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1`}>
                  {alertCount}
                </span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 rounded-md bg-popover text-popover-foreground text-xs font-medium shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="p-2 border-t border-border/50 space-y-0.5">
        <button 
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 w-full transition-all"
        >
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px] shrink-0" /> : <Moon className="w-[18px] h-[18px] shrink-0" />}
          {!collapsed && <span>{theme === 'dark' ? 'Mod luminos' : 'Mod întunecat'}</span>}
        </button>
        <button 
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-full transition-all"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>Deconectare</span>}
        </button>
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}