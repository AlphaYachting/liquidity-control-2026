import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, EyeOff } from 'lucide-react';

// Vertrauliche Absender: Treffer werden im CRM-Posteingang nicht angezeigt.
export default function InboxBlockedSenders() {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['inbox-blocked-senders'],
    queryFn: () => base44.entities.InboxBlockedSender.list('-created_date', 200),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inbox-blocked-senders'] });
    queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
  };

  const add = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    await base44.entities.InboxBlockedSender.create({ value: v, label: label.trim(), is_active: true });
    setValue(''); setLabel('');
    setBusy(false);
    refresh();
  };

  const remove = async (id) => {
    await base44.entities.InboxBlockedSender.delete(id);
    refresh();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <EyeOff className="w-4 h-4" /> Vertrauliche Absender ausblenden
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          E-Mails dieser Absender erscheinen nicht im CRM-Posteingang. Eintragen lässt sich eine ganze
          Adresse (meinanwalt@unseranwalt.at) oder eine Domain (unseranwalt.at) für alle Adressen dahinter.
        </p>

        <div className="flex flex-wrap gap-2">
          <Input value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="Adresse oder Domain" className="h-8 text-xs w-64" />
          <Input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Notiz (optional)" className="h-8 text-xs w-56" />
          <Button size="sm" className="h-8 text-xs gap-1" onClick={add} disabled={busy || !value.trim()}>
            <Plus className="w-3.5 h-3.5" /> Hinzufügen
          </Button>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Lädt…</p>
        ) : rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch kein Filter eingetragen.</p>
        ) : (
          <div className="divide-y border rounded-lg">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2">
                <span className="text-xs font-medium">{r.value}</span>
                {r.label && <span className="text-xs text-muted-foreground truncate">· {r.label}</span>}
                <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto text-muted-foreground hover:text-destructive"
                  title="Entfernen" onClick={() => remove(r.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}