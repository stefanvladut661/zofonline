/**
 * Randeaza fiecare pagina si fiecare componenta de layout, ca sa prindem erorile
 * de runtime pe care build-ul nu le vede (build-ul verifica doar ca modulele se
 * transforma, nu ca React chiar poate randa componenta).
 *
 * Randare pe server, deci datele din useQuery sunt `undefined` la primul render —
 * exact cazul in care componentele crapa daca nu trateaza starea de incarcare.
 */
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/AuthContext';

import Dashboard from '@/pages/Dashboard';
import Rame from '@/pages/Rame';
import Analytics from '@/pages/Analytics';
import Vanzari from '@/pages/Vanzari';
import ComenziOnline from '@/pages/ComenziOnline';
import Rapoarte from '@/pages/Rapoarte';
import Alerte from '@/pages/Alerte';
import Setari from '@/pages/Setari';
import Conectori from '@/pages/Conectori';
import ProductDetail from '@/pages/ProductDetail';
import AppLayout from '@/components/layout/AppLayout';
import PageNotFound from '@/lib/PageNotFound';

let pass = 0, fail = 0;

function check(name, node, { route = '/' } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false, enabled: false } },
  });
  try {
    const html = renderToString(
      <AuthProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={route} element={node} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthProvider>,
    );
    if (typeof html !== 'string' || html.length === 0) throw new Error('randare goala');
    pass++;
    console.log('  OK   ' + name);
  } catch (err) {
    fail++;
    console.log('  FAIL ' + name + '  -> ' + err.message.split('\n')[0]);
  }
}

console.log('\n--- Pagini (date neincarcate, cazul cel mai fragil) ---');
check('Dashboard', <Dashboard />);
check('Rame', <Rame />);
check('Analytics', <Analytics />);
check('Vanzari', <Vanzari />);
check('ComenziOnline', <ComenziOnline />);
check('Rapoarte', <Rapoarte />);
check('Alerte', <Alerte />);
check('Setari', <Setari />);
check('Conectori', <Conectori />);
check('ProductDetail', <ProductDetail />, { route: '/rame/RB-3025-001' });
check('PageNotFound', <PageNotFound />);

console.log('\n--- Layout ---');
check('AppLayout', <AppLayout />);

console.log('\n' + '='.repeat(40) + `\n  ${pass} trecute, ${fail} esuate\n` + '='.repeat(40));
if (fail) process.exitCode = 1;
