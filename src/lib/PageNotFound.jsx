import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function PageNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <span className="text-2xl font-bold text-primary">404</span>
        </div>
        <h1 className="text-xl font-bold">Pagină negăsită</h1>
        <p className="text-sm text-muted-foreground">Pagina pe care o căutați nu există.</p>
        <Link to="/">
          <Button variant="outline" className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Înapoi la Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}