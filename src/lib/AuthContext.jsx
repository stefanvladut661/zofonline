import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { db } from '@/lib/data';

/**
 * Contextul de autentificare.
 *
 * Rescris la detasarea de Base44. Versiunea veche apela `createAxiosClient(...)`
 * — o functie care nu era importata si nu exista nicaieri in cod — plus
 * endpoint-ul proprietar /api/apps/public. Ambele au disparut; sursa de adevar
 * e acum providerul din src/lib/auth/session.js.
 */

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const currentUser = await db.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('[auth] Verificarea sesiunii a esuat:', error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({
        type: error.type ?? 'auth_required',
        message: error.message ?? 'Autentificare necesara',
      });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const logout = useCallback(async () => {
    await db.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        authError,
        authChecked,
        logout,
        checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
