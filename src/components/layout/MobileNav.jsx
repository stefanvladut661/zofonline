const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState } from 'react';
import { useTheme } from '@/lib/hooks/useTheme';
import { useUserRole } from '@/lib/hooks/useUserRole';

import { Link, useLocation } from 'react-router-dom';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { 
  LayoutDashboard, Glasses, BarChart3, ShoppingCart, 
  Globe, FileText, Bell, Settings, Menu, X,
  Moon, Sun, LogOut, Server
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/rame', icon: Glasses, label: 'Rame' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/vanzari', icon: ShoppingCart, label: 'Vânzări' },
  { path: '/comenzi-online', icon: Globe, label: 'Comenzi Online' },
  { path: '/rapoarte', icon: FileText, label: 'Rapoarte' },
  { path: '/alerte', icon: Bell, label: 'Alerte' },
  { path: '/conectori', icon: Server, label: 'Conectori', adminOnly: true },
  { path: '/setari', icon: Settings, label: 'Setări', adminOnly: true },
];

export default function MobileNav({ alertCount = 0 }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isAdmin } = useUserRole();

  const filteredItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 glass-strong flex items-center justify-between px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">Z</span>
          </div>
          <span className="font-bold text-sm">Zof Stoc Online</span>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/alerte" className="relative p-2">
            <Bell className="w-5 h-5 text-muted-foreground" />
            {alertCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-0.5">
                {alertCount}
              </span>
            )}
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="p-2">
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <div className="flex flex-col h-full">
                <div className="flex items-center h-14 px-4 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                      <span className="text-primary-foreground font-bold text-xs">Z</span>
                    </div>
                    <span className="font-bold text-sm">Meniu</span>
                  </div>
                </div>
                <nav className="flex-1 py-3 px-3 space-y-0.5">
                  {filteredItems.map(item => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all ${
                          isActive 
                            ? 'bg-primary text-primary-foreground' 
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                      >
                        <item.icon className="w-5 h-5" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
                <div className="p-3 border-t border-border/50 space-y-0.5">
                  <button 
                    onClick={toggleTheme}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 w-full"
                  >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    <span>{theme === 'dark' ? 'Mod luminos' : 'Mod întunecat'}</span>
                  </button>
                  <button 
                    onClick={() => db.auth.logout()}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-full"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Deconectare</span>
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-border/50 lg:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {filteredItems.slice(0, 5).map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}