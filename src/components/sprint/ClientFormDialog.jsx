import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { kundennameKlaeren } from '@/lib/kunden/kundeAnlegen';

const EMPTY = { name: '', contact_person: '', contact_email: '', billing_email: '', agb_version: '', notes: '' };

// Stammdaten eines BESTEHENDEN Kunden bearbeiten. Neue Kunden entstehen ausschließlich
// über den Kunden-Baustein (KundeAnlegenDialog / ClientLinkStep) — mit sevDesk-Verknüpfung.
export default function ClientFormDialog({ open, onOpenChange, client, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(client ? { ...EMPTY, ...client } : EMPTY);
  }, [open, client]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!client?.id || !form.name || !form.contact_email) return;
    setSaving(true);
    let geklaert;
    try {
      geklaert = await kundennameKlaeren(form.name, { ausserId: client?.id, erlaubeVerwenden: false });
    } catch (e) {
      setSaving(false);
      window.alert(e.message);
      return;
    }
    const data = {
      name: geklaert.name, contact_person: form.contact_person, contact_email: form.contact_email,
      billing_email: form.billing_email, agb_version: form.agb_version || 'offen', notes: form.notes,
    };
    try {
      await base44.entities.Client.update(client.id, data);
    } catch (e) {
      setSaving(false);
      window.alert(`Nicht gespeichert: ${e?.message || 'unbekannter Fehler'}`);
      return;
    }
    setSaving(false);
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold text-foreground">
            Kunde bearbeiten
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={set('name')} /></div>
          <div><Label>Ansprechperson</Label><Input value={form.contact_person} onChange={set('contact_person')} /></div>
          <div><Label>Kontakt-E-Mail *</Label><Input type="email" value={form.contact_email} onChange={set('contact_email')} /></div>
          <div><Label>Rechnungs-E-Mail</Label><Input type="email" value={form.billing_email} onChange={set('billing_email')} /></div>
          <div><Label>AGB-Version</Label><Input value={form.agb_version} onChange={set('agb_version')} placeholder="z. B. AGB 2026-01" /></div>
          <div><Label>Notizen</Label><Textarea rows={2} value={form.notes} onChange={set('notes')} /></div>
          <p className="text-xs text-muted-foreground">
            {client?.sevdesk_contact_id ? `sevDesk-Kontakt ${client.sevdesk_contact_id}` : 'Noch nicht mit sevDesk verknüpft'}
          </p>
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded"
            disabled={saving || !form.name || !form.contact_email}
            onClick={handleSave}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}