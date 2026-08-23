import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ensureContainer } from '@/lib/sprint/ensureContainer';
import { kuerzelVorschlag } from '@/lib/zeit/useProjektSuche';

// Das Projekt entsteht in der Zeile — schmaler Dialog, vorbelegt aus der Eingabe.
export default function SchnellProjektDialog({ open, onOpenChange, vorgabe = '', email, clients = [], onCreated }) {
  const [clientId, setClientId] = useState('');
  const [neuerKunde, setNeuerKunde] = useState({ name: '', email: '' });
  const [titel, setTitel] = useState('Laufende Arbeit');
  const [modell, setModell] = useState('aufwand');
  const [stundensatz, setStundensatz] = useState('');
  const [kuerzel, setKuerzel] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: standardsatz } = useQuery({
    queryKey: ['standardStundensatz'],
    enabled: open,
    queryFn: async () => {
      const rows = await base44.entities.Setting.filter({ key: 'standard_stundensatz' }, '-updated_date', 1);
      return rows[0]?.value || '';
    },
  });

  useEffect(() => {
    if (!open) return;
    const treffer = clients.find((c) => (c.name || '').toLowerCase().includes(vorgabe.toLowerCase()));
    setClientId(treffer?.id || '');
    setNeuerKunde({ name: treffer ? '' : vorgabe, email: '' });
    setTitel('Laufende Arbeit');
    setModell('aufwand');
    setKuerzel(kuerzelVorschlag(treffer?.name || vorgabe));
  }, [open, vorgabe, clients]);

  useEffect(() => { if (open) setStundensatz(standardsatz || ''); }, [open, standardsatz]);

  const kundeName = clientId ? clients.find((c) => c.id === clientId)?.name : neuerKunde.name;
  const bereit = titel && kuerzel.length >= 2 && (clientId || (neuerKunde.name && neuerKunde.email));

  const anlegen = async () => {
    setSaving(true);
    let id = clientId;
    if (!id) {
      const client = await base44.entities.Client.create({
        name: neuerKunde.name,
        contact_email: neuerKunde.email,
        agb_version: 'offen',
      });
      id = client.id;
    }
    const project = await base44.entities.Project.create({
      client_id: id,
      title: titel,
      kuerzel: kuerzel.toLowerCase(),
      pm_email: email,
      status: 'aktiv',
      abrechnungsmodell: modell,
      ...(modell === 'aufwand' ? { stundensatz: Number(stundensatz) || 0 } : {}),
    });
    await ensureContainer(project);
    setSaving(false);
    onOpenChange(false);
    onCreated({ ...project, clientName: kundeName, kuerzelAnzeige: kuerzel.toLowerCase() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold text-foreground">Projekt anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Kunde</Label>
            <Select value={clientId || 'neu'} onValueChange={(v) => setClientId(v === 'neu' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="neu">Neuen Kunden anlegen</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!clientId && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Kundenname"
                value={neuerKunde.name}
                onChange={(e) => { setNeuerKunde((k) => ({ ...k, name: e.target.value })); setKuerzel(kuerzelVorschlag(e.target.value)); }}
              />
              <Input
                placeholder="E-Mail" type="email"
                value={neuerKunde.email}
                onChange={(e) => setNeuerKunde((k) => ({ ...k, email: e.target.value }))}
              />
            </div>
          )}
          <div><Label>Projekttitel</Label><Input value={titel} onChange={(e) => setTitel(e.target.value)} /></div>
          <div>
            <Label>Abrechnungsmodell</Label>
            <Select value={modell} onValueChange={setModell}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aufwand">Nach Aufwand</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {modell === 'aufwand' && (
            <div>
              <Label>Stundensatz (EUR)</Label>
              <Input type="number" value={stundensatz} onChange={(e) => setStundensatz(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Kürzel</Label>
            <Input maxLength={5} value={kuerzel} onChange={(e) => setKuerzel(e.target.value.slice(0, 5))} />
          </div>
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded"
            disabled={saving || !bereit}
            onClick={anlegen}
          >
            {saving ? 'Legt an…' : 'Anlegen und weiter buchen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}