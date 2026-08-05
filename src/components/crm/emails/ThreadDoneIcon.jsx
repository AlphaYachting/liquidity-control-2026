import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { emailApi } from '@/components/crm/emails/emailApi';

// Kleines Häkchen direkt in der Liste — erledigt markieren ohne Detailansicht.
export default function ThreadDoneIcon({ threadId, onChanged }) {
  const [saving, setSaving] = useState(false);

  const markDone = async (e) => {
    e.stopPropagation();
    if (!threadId || saving) return;
    setSaving(true);
    try {
      await emailApi('enrich', { thread_id: threadId, fields: { status: 'erledigt' } });
      onChanged?.(threadId, 'erledigt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      title="Als erledigt markieren"
      onClick={markDone}
      disabled={saving}
      className="shrink-0 w-6 h-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:bg-emerald-100 hover:text-emerald-600 hover:border-emerald-200 transition-colors"
    >
      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
    </button>
  );
}