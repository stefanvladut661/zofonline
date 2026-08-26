import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, LogIn, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';

/**
 * Ecranul de autentificare.
 *
 * Nu exista deloc pana acum: aplicatia mostenita presupunea OAuth-ul Base44, iar
 * dupa detasare nu mai era nicio cale de a intra.
 */
export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      // Mesajul vine de la server si e deliberat vag ("Email sau parola
      // gresita") — nu confirma daca adresa exista.
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-3">
            <span className="text-primary-foreground font-bold text-xl">Z</span>
          </div>
          <h1 className="text-lg font-semibold">Zof Stoc Online</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Autentificare</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-xl p-5 space-y-4">
          <div>
            <Label htmlFor="email" className="text-xs">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-xs">Parolă</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Intră în cont
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Conturile se creează din linia de comandă: <code className="font-mono">npm run server:user</code>
        </p>
      </motion.div>
    </div>
  );
}
