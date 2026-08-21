import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Cog, StickyNote, Paperclip, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const zeit = (d) =>
  d ? new Date(d).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

// Kommentare & Notizen — Verlaufsdarstellung wie im CRM, chronologisch mit Anhängen.
export default function KommentarStrang({ projectId, ticketId, milestoneId, compact }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [datei, setDatei] = useState(null);
  const fileRef = useRef(null);
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
    if (!inhalt && !datei) return;
    setSaving(true);
    let file_url;
    if (datei) {
      const res = await base44.integrations.Core.UploadFile({ file: datei });
      file_url = res.file_url;
    }
    await base44.entities.Comment.create({
      project_id: projectId,
      milestone_id: milestoneId || undefined,
      ticket_id: ticketId || undefined,
      author_email: me?.email || 'unbekannt',
      text: inhalt || datei.name,
      file_url,
      file_name: datei?.name,
      created_at: new Date().toISOString(),
    });
    setText('');
    setDatei(null);
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['comments', ticketId || projectId] });
  };

  return (
    <div className="space-y-3">
      <div className={compact ? 'max-h-64 overflow-y-auto pr-1' : ''}>
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Noch keine Einträge.</p>
        )}
        {comments.map((c, i) => {
          const system = c.author_email === 'System';
          const Icon = system ? Cog : StickyNote;
          return (
            <div key={c.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`p-1.5 rounded-full shrink-0 ${system ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-600'}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                {i < comments.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
              </div>
              <div className="pb-5 min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{system ? 'System' : c.author_email}</p>
                  <span className="text-[11px] text-muted-foreground shrink-0">{zeit(c.created_at || c.created_date)}</span>
                </div>
                <p className={`text-xs mt-0.5 whitespace-pre-wrap ${system ? 'italic text-muted-foreground' : 'text-muted-foreground'}`}>
                  {c.text}
                </p>
                {c.file_url && (
                  <a
                    href={c.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-[11px] text-primary hover:underline"
                  >
                    <Paperclip className="w-3 h-3" /> {c.file_name || 'Dokument'}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <Textarea
          rows={compact ? 2 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Notiz oder Kommentar schreiben…"
          className="text-[13px]"
        />
        {datei && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Paperclip className="w-3 h-3" /> {datei.name}
            <button onClick={() => setDatei(null)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
          </p>
        )}
        <div className="flex justify-between">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => setDatei(e.target.files?.[0] || null)}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Paperclip className="w-3.5 h-3.5 mr-1.5" /> Dokument
          </Button>
          <Button onClick={senden} disabled={saving || (!text.trim() && !datei)} size="sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}