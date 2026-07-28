import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { emailApi } from '@/components/crm/emails/emailApi';

// Thread-Status in der zentralen E-Mail-DB auf "erledigt" setzen (bzw. wieder öffnen).
export default function ThreadDoneButton({ threadId, status, onChanged }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const isDone = status === 'erledigt';

  const setStatus = async (newStatus) => {
    if (!threadId) return;
    setSaving(true); setError(null);
    try {
      await emailApi('enrich', { thread_id: threadId, fields: { status: newStatus } });
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Speichern fehlgeschlagen');
    }
    setSaving(false);
  };

  return (
    <div className="shrink-0 text-right">
      <Button
        size="sm"
        variant={isDone ? 'outline' : 'default'}
        disabled={saving}
        onClick={() => setStatus(isDone ? 'offen' : 'erledigt')}
        className="gap-2"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : isDone ? <RotateCcw className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
        {isDone ? 'Wieder öffnen' : 'Als erledigt markieren'}
      </Button>
      {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
    </div>
  );
}