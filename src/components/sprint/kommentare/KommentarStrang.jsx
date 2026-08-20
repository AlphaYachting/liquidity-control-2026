import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Cog } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RITTLER } from '@/components/sprint/sprintConfig';

const zeit = (d) =>
  d ? new Date(d).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

// Kommentare & Notizen — chronologisch, neueste unten. Gefiltert auf Projekt oder einzelne Aufgabe.
export default function KommentarStrang({ projectId, ticketId, milestoneId, compact }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const scope = ticketId ? { ticket_id: ticketId } : { project_id: projectId };

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { data: comments = [] } = useQuery({
    enabled: Boolean(projectId || ticketId),
    queryKey: ['comments', ticketId || projectId],
    queryFn: () => base44.entities.Comment.filter(scope, 'created_date', 200),
  });

  const senden = async () => {
    const inhalt = text.trim();
    if (!inhalt) return;
    setSaving(true);
    await base44.entities.Comment.create({
      project_id: projectId,
      milestone_id: milestoneId || undefined,
      ticket_id: ticketId || undefined,
      author_email: me?.email || 'unbekannt',
      text: inhalt,
      created_at: new Date().toISOString(),
    });
    setText('');
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['comments', ticketId || projectId] });
  };

  return (
    <div className="space-y-3">
      <div className={`space-y-3 ${compact ? 'max-h-64 overflow-y-auto pr-1' : ''}`}>
        {comments.length === 0 && (
          <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>Noch keine Einträge.</p>
        )}
        {comments.map((c) => {
          const system = c.author_email === 'System';
          return (
            <div key={c.id} className="flex gap-2.5">
              <span
                className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold uppercase"
                style={{
                  backgroundColor: system ? RITTLER.surface : RITTLER.black,
                  color: system ? RITTLER.textSecondary : '#ffffff',
                }}
              >
                {system ? <Cog className="w-3 h-3" /> : (c.author_email || '?').slice(0, 2)}
              </span>
              <div className="min-w-0">
                <p className="text-[11px]" style={{ color: RITTLER.textSecondary }}>
                  {system ? 'System' : c.author_email} · {zeit(c.created_at || c.created_date)}
                </p>
                <p
                  className="text-[13px] whitespace-pre-wrap leading-relaxed"
                  style={{ color: system ? RITTLER.textSecondary : RITTLER.black, fontStyle: system ? 'italic' : 'normal' }}
                >
                  {c.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 items-end">
        <Textarea
          rows={compact ? 2 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Notiz oder Kommentar schreiben…"
          className="text-[13px]"
        />
        <Button onClick={senden} disabled={saving || !text.trim()} size="icon" className="shrink-0">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}