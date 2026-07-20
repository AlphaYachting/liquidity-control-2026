import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function InboxCaptureDialog({ open, onOpenChange, onSaved }) {
  const [form, setForm] = useState({ sender_name: '', sender_email: '', sender_phone: '', subject: '', body: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.CrmInboxItem.create({
        ...form,
        source: 'manual',
        received_at: new Date().toISOString(),
        status: 'new',
      });
      setForm({ sender_name: '', sender_email: '', sender_phone: '', subject: '', body: '' });
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Anfrage manuell erfassen</DialogTitle></DialogHeader>
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
            <Textarea rows={4} value={form.body} onChange={e => set('body', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Speichert…' : 'Erfassen'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}