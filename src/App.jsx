import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

import PageNotFound from '@/lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { getApiBaseUrl } from '@/lib/api-service';

import AppLayout from '@/components/layout/AppLayout';
import Login from '@/pages/Login';
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

const Splash = ({ children }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
    <div className="flex flex-col items-center gap-3 text-center max-w-sm">
      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
        <span className="text-primary-foreground font-bold">Z</span>
      </div>
      {children}
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { isAuthenticated, isLoadingAuth, authError } = useAuth();

  if (isLoadingAuth) {
    return (
      <Splash>
        <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground">Se încarcă...</p>
      </Splash>
    );
  }

  // Server oprit sau inaccesibil. Ecranul de login ar fi minciuna aici — nu ai
  // cu ce sa te autentifici, problema nu e la parola.
  if (authError?.type === 'server_unreachable') {
    return (
      <Splash>
        <AlertTriangle className="w-6 h-6 text-amber-500" />
        <p className="text-sm font-semibold">Serverul nu răspunde</p>
        <p className="text-xs text-muted-foreground">
          Nu pot contacta <code className="font-mono">{getApiBaseUrl()}</code>.
          Pornește-l cu <code className="font-mono">npm run server</code>.
        </p>
      </Splash>
    );
  }

  if (authError) {
    return (
      <Splash>
        <AlertTriangle className="w-6 h-6 text-destructive" />
        <p className="text-sm font-semibold">Eroare de autentificare</p>
        <p className="text-xs text-muted-foreground">{authError.message}</p>
      </Splash>
    );
  }

  if (!isAuthenticated) return <Login />;

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
  );
}

export default App;
