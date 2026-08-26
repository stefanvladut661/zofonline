import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ZofAPI } from '@/lib/api-service';

const SOURCE_TYPES = [
  { value: 'dorsoft', label: 'Dorsoft' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'manual', label: 'Manual' },
  { value: 'system', label: 'System' },
];

export default function AddConnectorDialog({ open, onClose, onSubmit, saving }) {
  const [form, setForm] = useState({ name: '', connectorId: '', locationId: '', sourceType: 'dorsoft' });

  // Locatiile erau hardcodate in acest fisier. Acum vin de la server, ca sa nu
  // poti asigna un agent unei locatii care nu exista in baza.
  const { data: locations = [] } = useQuery({
    queryKey: ['locations-admin'],
    queryFn: () => ZofAPI.admin.listLocations(),
    enabled: open,
  });

  const handleSubmit = () => {
    if (!form.name || !form.connectorId || !form.locationId) return;
    const loc = locations.find(l => l.id === form.locationId);
    onSubmit({ ...form, locationName: loc?.name || form.locationId });
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass">
        <DialogHeader>
          <DialogTitle>Adaugă Connector</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Denumire connector</Label>
            <Input className="mt-1" placeholder="ex: PC Argeș Mall 1" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Connector ID (unic per PC)</Label>
            <Input className="mt-1" placeholder="ex: arges-mall-pc1" value={form.connectorId} onChange={e => set('connectorId', e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
          </div>
          <div>
            <Label className="text-xs">Locație</Label>
            <Select value={form.locationId} onValueChange={v => set('locationId', v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={locations.length ? 'Selectează locație' : 'Nicio locație definită'} />
              </SelectTrigger>
              <SelectContent>
                {locations.map(l => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}{l.type === 'online' ? ' (Online)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tip sursă</Label>
            <Select value={form.sourceType} onValueChange={v => set('sourceType', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Anulează</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.name || !form.connectorId || !form.locationId}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
            Creează
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}