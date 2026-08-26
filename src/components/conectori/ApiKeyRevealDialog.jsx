import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, CheckCircle, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export default function ApiKeyRevealDialog({ open, apiKey, connectorName, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass">
        <DialogHeader>
          <DialogTitle>Cheie API — {connectorName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-600">Salvează această cheie în siguranță. Nu poate fi recuperată ulterior. Dacă o pierzi, generează una nouă.</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 font-mono text-xs break-all border border-border">
            {apiKey}
          </div>
          <div className="text-[10px] text-muted-foreground">
            <p className="font-semibold mb-1">Cum se folosește:</p>
            <code className="block p-2 bg-muted rounded text-[10px]">
              Authorization: Bearer {apiKey}
            </code>
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 gap-1.5" onClick={handleCopy}>
            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiat!' : 'Copiază cheia'}
          </Button>
          <Button variant="outline" onClick={onClose}>Închide</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}