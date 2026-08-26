import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Rame from '@/pages/Rame';
import Analytics from '@/pages/Analytics';
import Vanzari from '@/pages/Vanzari';
import ComenziOnline from '@/pages/ComenziOnline';
import Rapoarte from '@/pages/Rapoarte';
import Alerte from '@/pages/Alerte';
import Setari from '@/pages/Setari';
import ProductDetail from '@/pages/ProductDetail';
import Conectori from '@/pages/Conectori';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold">Z</span>
          </div>
          <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
          <p className="text-xs text-muted-foreground">Se încarcă...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/rame" element={<Rame />} />
        <Route path="/rame/:sku" element={<ProductDetail />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/vanzari" element={<Vanzari />} />
        <Route path="/comenzi-online" element={<ComenziOnline />} />
        <Route path="/rapoarte" element={<Rapoarte />} />
        <Route path="/alerte" element={<Alerte />} />
        <Route path="/conectori" element={<Conectori />} />
        <Route path="/setari" element={<Setari />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App