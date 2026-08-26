import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { ZofAPI } from '@/lib/api-service';
import { ApiError } from '@/lib/api/client';

/**
 * Contextul de autentificare.
 *
 * Sesiunea traieste intr-un cookie HttpOnly pus de server; aici nu tinem niciun
 * token. `me()` intoarce 401 cand nu esti logat — asta nu e o eroare, e raspunsul
 * normal pentru „nu am sesiune", si il tratam ca atare.
 */

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      setUser(await ZofAPI.auth.me());
    } catch (error) {
      setUser(null);
      // 401 = pur si simplu nu esti logat. Orice altceva (server oprit, CORS,
      // 500) e o problema reala si trebuie spusa, nu ascunsa in spatele
      // ecranului de login.
      if (!(error instanceof ApiError) || error.status !== 401) {
        setAuthError({
          type: error.status === 0 ? 'server_unreachable' : 'unknown',
          message: error.message,
        });
      }
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const login = useCallback(async (email, password) => {
    const loggedIn = await ZofAPI.auth.login(email, password);
    setUser(loggedIn);
    setAuthError(null);
    return loggedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await ZofAPI.auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoadingAuth,
        authError,
        authChecked,
        login,
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
