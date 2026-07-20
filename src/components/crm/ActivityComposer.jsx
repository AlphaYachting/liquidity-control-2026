import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ActivityComposer({ dealId, onAdded }) {
  const [type, setType] = useState('note');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await base44.entities.CrmActivity.create({
        deal_id: dealId,
        activity_type: type,
        content: content.trim(),
        activity_date: new Date().toISOString(),
      });
      setContent('');
      onAdded?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
      <div className="flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="note">📝 Notiz</SelectItem>
            <SelectItem value="call">📞 Anruf</SelectItem>
            <SelectItem value="email">✉️ E-Mail</SelectItem>
            <SelectItem value="meeting">📅 Termin</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="ml-auto h-8" onClick={add} disabled={saving || !content.trim()}>
          {saving ? 'Speichert…' : 'Erfassen'}
        </Button>
      </div>
      <Textarea rows={2} value={content} onChange={e => setContent(e.target.value)}
        placeholder="Was ist passiert? (z.B. Telefonat geführt, Kunde meldet sich nächste Woche)" className="bg-background text-sm" />
    </div>
  );
}