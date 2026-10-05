import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// Nur für Admins: Buchungssperre bei verbrauchtem Monatskontingent.
export default function KontingentSperreSchalter({ form, setForm, user }) {
  if (user?.role !== 'admin') return null;
  const hatKontingent = Number(form.support_kontingent_stunden) > 0;
  return (
    <div>
      <div className="flex items-center gap-2">
        <Switch
          checked={!!form.kontingent_sperre}
          disabled={!hatKontingent}
          onCheckedChange={(v) => setForm((f) => ({ ...f, kontingent_sperre: v }))}
        />
        <Label>Buchen sperren, wenn das Monatskontingent verbraucht ist</Label>
      </div>
      {!hatKontingent && <p className="text-xs text-muted-foreground mt-1">Erst ein Monatskontingent eintragen</p>}
    </div>
  );
}