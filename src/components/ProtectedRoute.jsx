import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

/**
 * Garda de ruta.
 *
 * NOTA: fisierul ajunsese in export trunchiat la jumatatea unei expresii
 * (`return <UserNotRegisteredError />;` si atat, fara acolade de inchidere) —
 * o victima a scrape-ului esuat din browser. Build-ul nu semnala nimic pentru ca
 * nicio ruta nu il importa inca. Restaurat aici la comportamentul intentionat.
 *
 * Momentan neutilizat: App.jsx trateaza starile de auth global, iar Setari si
 * Conectori isi verifica singure rolul. Devine util cand gate-uim rutele pe rol
 * (User.role = admin | angajat) in loc sa repetam verificarea in fiecare pagina.
 */

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement ?? fallback;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement ?? fallback;
  }

  return <Outlet />;
}
