import React from 'react';
import { PackageOpen } from 'lucide-react';

export default function EmptyState({ icon: Icon = PackageOpen, title = "Fără date", description = "Nu există date disponibile momentan." }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-2xl bg-muted/50 mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
    </div>
  );
}