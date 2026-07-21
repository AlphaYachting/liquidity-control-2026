import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mic, Square, Loader2, Sparkles, Upload } from 'lucide-react';
import { calcTotals } from '@/components/crm/quotes/quoteConfig';

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    customer_name: { type: 'string' },
    contact_name: { type: 'string' },
    contact_email: { type: 'string' },
    intro_text: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          unit_price: { type: 'number' },
        },
      },
    },
    vat_rate: { type: 'number' },
    notes: { type: 'string' },
  },
};

export default function QuoteCaptureDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [source, setSource] = useState('transcript');
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | recording | transcribing | analyzing | saving
  const [error, setError] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const transcriptFileRef = useRef(null);

  const busy = ['transcribing', 'reading_file', 'analyzing', 'saving'].includes(phase);

  const handleTranscriptFile = async (file) => {
    setError(null);
    setPhase('reading_file');
    try {
      if (/\.pdf$/i.test(file.name)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: { type: 'object', properties: { transcript_text: { type: 'string', description: 'Der vollständige Textinhalt des Dokuments' } } },
        });
        if (res.status !== 'success') throw new Error(res.details || 'PDF konnte nicht gelesen werden');
        const content = res.output?.transcript_text || (Array.isArray(res.output) ? res.output.map(o => o.transcript_text).join('\n') : '');
        setText(t => (t ? t + '\n' : '') + content);
      } else {
        const content = await file.text();
        setText(t => (t ? t + '\n' : '') + content);
      }
      setPhase('idle');
    } catch (e) {
      setError('Datei konnte nicht gelesen werden: ' + (e?.message || ''));
      setPhase('idle');
    }
  };

  const startRecording = async () => {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => chunksRef.current.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      await transcribeBlob(new File([blob], 'sprachmemo.webm', { type: blob.type }));
    };
    mediaRef.current = rec;
    rec.start();
    setPhase('recording');
  };

  const stopRecording = () => mediaRef.current?.stop();

  const transcribeBlob = async (file) => {
    setPhase('transcribing');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const transcript = await base44.integrations.Core.TranscribeAudio({ audio_url: file_url });
      setText(t => (t ? t + '\n' : '') + (transcript || ''));
      setPhase('idle');
    } catch (e) {
      setError('Transkription fehlgeschlagen: ' + (e?.message || ''));
      setPhase('idle');
    }
  };

  const handleAnalyze = async () => {
    setError(null);
    setPhase('analyzing');
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Du bist Angebots-Assistent einer österreichischen Digitalagentur (Rittler & Co). Analysiere den folgenden Input (${source === 'email' ? 'Kunden-E-Mail' : source === 'voice_memo' ? 'transkribiertes Sprachmemo' : 'Gesprächstranskript'}) und extrahiere daraus einen strukturierten Angebotsentwurf auf Deutsch.

Regeln:
- Leite konkrete Angebotspositionen (Leistungen) mit realistischer Struktur ab. Wenn Beträge genannt werden, übernimm sie exakt; sonst lasse unit_price auf 0.
- quantity default 1, unit default "pauschal" (oder "Stunden" wenn Stundensätze genannt werden).
- intro_text: kurzes professionelles Anschreiben (2-3 Sätze), das Bezug auf die Anfrage nimmt.
- title: prägnante Angebotsbezeichnung.
- Erfinde keine Preise und keine Leistungen, die nicht aus dem Input hervorgehen.

INPUT:
"""
${text}
"""`,
        response_json_schema: EXTRACTION_SCHEMA,
      });

      setPhase('saving');
      const items = (result.items || []).map((it, idx) => ({
        position: idx + 1,
        title: it.title || '',
        description: it.description || '',
        quantity: Number(it.quantity) || 1,
        unit: it.unit || 'pauschal',
        unit_price: Number(it.unit_price) || 0,
        total_price: (Number(it.quantity) || 1) * (Number(it.unit_price) || 0),
      }));
      const vatRate = Number(result.vat_rate) || 20;
      const totals = calcTotals(items, vatRate);
      const quote = await base44.entities.CrmQuote.create({
        title: result.title || 'Neues Angebot',
        customer_name: result.customer_name || '',
        contact_name: result.contact_name || '',
        contact_email: result.contact_email || '',
        intro_text: result.intro_text || '',
        items,
        vat_rate: vatRate,
        ...totals,
        status: 'draft',
        source,
        source_text: text,
        notes: result.notes || '',
      });
      onOpenChange(false);
      setText('');
      setPhase('idle');
      navigate(`/crm/quotes/${quote.id}`);
    } catch (e) {
      setError('Analyse fehlgeschlagen: ' + (e?.message || ''));
      setPhase('idle');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy && phase !== 'recording') onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Neues Angebot erfassen</DialogTitle>
        </DialogHeader>
        <Tabs value={source} onValueChange={setSource}>
          <TabsList className="w-full">
            <TabsTrigger value="transcript" className="flex-1">📝 Transkript</TabsTrigger>
            <TabsTrigger value="email" className="flex-1">✉️ Kunden-E-Mail</TabsTrigger>
            <TabsTrigger value="voice_memo" className="flex-1">🎙️ Sprachmemo</TabsTrigger>
          </TabsList>
        </Tabs>

        {source === 'transcript' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy}
              onClick={() => transcriptFileRef.current?.click()} className="gap-2">
              <Upload className="w-3.5 h-3.5" /> Transkriptdatei hochladen
            </Button>
            <input ref={transcriptFileRef} type="file" accept=".txt,.md,.vtt,.srt,.pdf,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTranscriptFile(f); e.target.value = ''; }} />
            {phase === 'reading_file' && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Datei wird gelesen…
              </span>
            )}
          </div>
        )}

        {source === 'voice_memo' && (
          <div className="flex items-center gap-2">
            {phase === 'recording' ? (
              <Button variant="destructive" size="sm" onClick={stopRecording} className="gap-2">
                <Square className="w-3.5 h-3.5" /> Aufnahme stoppen
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={startRecording} disabled={busy} className="gap-2">
                <Mic className="w-3.5 h-3.5" /> Aufnahme starten
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={busy || phase === 'recording'}
              onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="w-3.5 h-3.5" /> Audio-Datei hochladen
            </Button>
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) transcribeBlob(f); e.target.value = ''; }} />
            {phase === 'transcribing' && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Wird transkribiert…
              </span>
            )}
          </div>
        )}

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={source === 'email'
            ? 'Kunden-E-Mail hier einfügen…'
            : source === 'voice_memo'
              ? 'Transkription erscheint hier — oder direkt Text eingeben…'
              : 'Gesprächstranskript hier einfügen…'}
          className="min-h-[220px] text-sm"
          disabled={busy}
        />

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy || phase === 'recording'}>
            Abbrechen
          </Button>
          <Button onClick={handleAnalyze} disabled={busy || phase === 'recording' || !text.trim()} className="gap-2">
            {['analyzing', 'saving'].includes(phase)
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Sparkles className="w-4 h-4" />}
            {phase === 'analyzing' ? 'KI analysiert…' : phase === 'saving' ? 'Wird gespeichert…' : 'Angebotsentwurf erstellen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}