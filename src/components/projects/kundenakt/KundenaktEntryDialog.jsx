import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Paperclip, Sparkles, Check } from 'lucide-react';
import VoiceFeedbackInput from '@/components/crm/emails/VoiceFeedbackInput';
import { ENTRY_TYPES } from '@/components/projects/kundenakt/kundenaktConfig';

// Overlay zur Erfassung eines Kundenakt-Eintrags: tippen oder einsprechen,
// optional Dokument anhängen, Typ und Titel schlägt die Projektintelligenz vor.
export default function KundenaktEntryDialog({
  open, onClose, projectId, projectName, customer, onSaved,
  initialEntryType, initialTitle, initialContent,
}) {
  const [entryType, setEntryType] = useState(initialEntryType || 'update');
  const [title, setTitle] = useState(initialTitle || '');
  const [content, setContent] = useState(initialContent || '');
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setEntryType(initialEntryType || 'update');
    setTitle(initialTitle || '');
    setContent(initialContent || '');
    setFile(null);
    setSummary(''); setError(null);
  };

  // Vorbefüllung übernehmen, wenn das Overlay mit neuen Werten geöffnet wird
  React.useEffect(() => {
    if (!open) return;
    if (initialEntryType) setEntryType(initialEntryType);
    if (initialTitle !== undefined) setTitle(initialTitle || '');
    if (initialContent !== undefined) setContent(initialContent || '');
  }, [open, initialEntryType, initialTitle, initialContent]);

  const close = () => { reset(); onClose(); };

  const analyse = async () => {
    setAnalysing(true); setError(null);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Du unterstützt den digitalen Kundenakt der Agentur Rittler & Co.
Projekt: ${projectName || '—'} | Kunde: ${customer || '—'}
Eingabe des Mitarbeiters (getippt oder eingesprochen):
"""${content}"""
${file ? `Angehängtes Dokument: ${file.name}` : ''}

Bestimme die Art des Eintrags (vereinbarung = verbindliche Absprache mit dem Kunden, update = Statusmeldung zum Projekt, dokument = das Dokument selbst ist der Inhalt), einen sachlichen Kurztitel (max. 8 Wörter) und eine Kernaussage in einem Satz. Nichts erfinden, nur was in der Eingabe steht.`,
        response_json_schema: {
          type: 'object',
          properties: {
            entry_type: { type: 'string', enum: ['vereinbarung', 'update', 'dokument'] },
            title: { type: 'string' },
            summary: { type: 'string' },
          },
        },
      });
      if (res?.entry_type) setEntryType(res.entry_type);
      if (res?.title) setTitle(res.title);
      if (res?.summary) setSummary(res.summary);
    } catch (e) {
      setError('Vorschlag fehlgeschlagen: ' + (e?.message || ''));
    }
    setAnalysing(false);
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      let fileUrl = '';
      if (file) {
        const up = await base44.integrations.Core.UploadFile({ file });
        fileUrl = up.file_url;
      }
      const me = await base44.auth.me().catch(() => null);
      await base44.entities.ProjectFileEntry.create({
        project_id: projectId,
        entry_type: entryType,
        title: title || ENTRY_TYPES[entryType].label,
        content,
        ai_summary: summary,
        file_url: fileUrl,
        file_name: file?.name || '',
        entry_date: new Date().toISOString(),
        recorded_by: me?.full_name || me?.email || '',
      });
      onSaved?.();
      close();
    } catch (e) {
      setError('Speichern fehlgeschlagen: ' + (e?.message || ''));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw]">
        <DialogHeader>
          <DialogTitle className="text-base">Eintrag im Kundenakt erfassen</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">Inhalt — tippen oder einsprechen</Label>
            <div className="mt-1">
              <VoiceFeedbackInput
                value={content}
                onChange={setContent}
                placeholder="Was wurde vereinbart, was ist neu im Projekt?"
                disabled={saving}
                rows={10}
                textClassName="text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground">Dokument (optional)</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={saving} className="h-8 text-xs" />
              {file && <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            </div>
          </div>

          <Button size="sm" variant="outline" onClick={analyse}
            disabled={analysing || saving || (!content && !file)} className="gap-2">
            {analysing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {analysing ? 'Projektintelligenz prüft…' : 'Art und Titel vorschlagen'}
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground">Art</Label>
              <Select value={entryType} onValueChange={setEntryType} disabled={saving}>
                <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ENTRY_TYPES).map(([v, m]) => (
                    <SelectItem key={v} value={v} className="text-xs">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)}
                disabled={saving} className="mt-1 h-8 text-xs" />
            </div>
          </div>

          {summary && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Check className="w-3.5 h-3.5 text-status-done shrink-0 mt-0.5" /> {summary}
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={close} disabled={saving}>Abbrechen</Button>
            <Button size="sm" onClick={save} disabled={saving || (!content && !file)} className="gap-2">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              In den Kundenakt aufnehmen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}