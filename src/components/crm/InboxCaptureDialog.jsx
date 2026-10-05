import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const LEER = { sender_name: '', sender_email: '', sender_phone: '', subject: '', body: '' };

const ausEintrag = (item) => ({
  sender_name: item?.sender_name || '',
  sender_email: item?.sender_email || '',
  sender_phone: item?.sender_phone || '',
  subject: item?.subject || '',
  body: item?.body || '',
});

// Ohne `item`: neue Anfrage manuell erfassen. Mit `item`: manuell erfassten Eintrag bearbeiten.
export default function InboxCaptureDialog({ open, onOpenChange, onSaved, item = null }) {
  const bearbeiten = !!item;
  const [form, setForm] = useState(LEER);
  const [saving, setSaving] = useState(false);
  const [fehler, setFehler] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) {
      setForm(bearbeiten ? ausEintrag(item) : LEER);
      setFehler('');
    }
  }, [open, bearbeiten, item?.id]);

  const save = async () => {
    setSaving(true);
    setFehler('');
    try {
      if (bearbeiten) {
        await base44.entities.CrmInboxItem.update(item.id, form);
      } else {
        await base44.entities.CrmInboxItem.create({
          ...form,
          source: 'manual',
          received_at: new Date().toISOString(),
          status: 'new',
        });
      }
      setForm(LEER);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setFehler(bearbeiten
        ? 'Der Eintrag konnte nicht gespeichert werden — dafür fehlt dir vermutlich die Berechtigung.'
        : 'Die Anfrage konnte nicht erfasst werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bearbeiten ? 'Erfasste Anfrage bearbeiten' : 'Anfrage manuell erfassen'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.sender_name} onChange={e => set('sender_name', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Telefon</Label>
              <Input value={form.sender_phone} onChange={e => set('sender_phone', e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">E-Mail</Label>
            <Input type="email" value={form.sender_email} onChange={e => set('sender_email', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Betreff</Label>
            <Input value={form.subject} onChange={e => set('subject', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Anfrage-Inhalt</Label>
            <Textarea rows={bearbeiten ? 8 : 4} value={form.body} onChange={e => set('body', e.target.value)} />
          </div>
          {fehler && <p className="text-meta text-status-critical">{fehler}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Speichert…' : bearbeiten ? 'Speichern' : 'Erfassen'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
