import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mic, Square, Loader2, Upload, Plus } from 'lucide-react';
import { extractDocxText } from '@/components/crm/quotes/docxText';
import { DOC_TYPE_META } from '@/components/crm/proposals/sourceDocs';

// Erfassungsleiste: liest Dateien/Aufnahmen ein und übergibt sie als
// eigenständiges Dokument (nicht als Freitext) an onAddDocument(docType, label, text).
export default function NotesCaptureBar({ disabled, types = ['transcript', 'email', 'voice_memo'], onAddDocument }) {
  const [source, setSource] = useState(types[0]);
  const [phase, setPhase] = useState('idle'); // idle | recording | transcribing | reading_file | saving
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const audioFileRef = useRef(null);
  const fileRef = useRef(null);
  const busy = ['transcribing', 'reading_file', 'saving'].includes(phase);

  const addDoc = async (label, text) => {
    if (!text?.trim()) return;
    setPhase('saving');
    try {
      await onAddDocument(source, label, text);
      setPasteText('');
      setError(null);
    } catch (e) {
      setError('Dokument konnte nicht gespeichert werden: ' + (e?.message || ''));
    }
    setPhase('idle');
  };

  const handleFile = async (file) => {
    setError(null);
    setPhase('reading_file');
    try {
      let text = '';
      if (/\.pdf$/i.test(file.name)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: { type: 'object', properties: { transcript_text: { type: 'string', description: 'Der vollständige Textinhalt des Dokuments' } } },
        });
        if (res.status !== 'success') throw new Error(res.details || 'PDF konnte nicht gelesen werden');
        text = res.output?.transcript_text || (Array.isArray(res.output) ? res.output.map(o => o.transcript_text).join('\n') : '');
      } else if (/\.docx$/i.test(file.name)) {
        text = await extractDocxText(file);
      } else if (/\.doc$/i.test(file.name)) {
        throw new Error('Bitte die Datei als .docx speichern (altes .doc-Format wird nicht unterstützt)');
      } else {
        text = await file.text();
      }
      await addDoc(file.name, text);
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

  const transcribeBlob = async (file) => {
    setPhase('transcribing');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const transcript = await base44.integrations.Core.TranscribeAudio({ audio_url: file_url });
      await addDoc(`Sprachmemo ${new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`, transcript || '');
    } catch (e) {
      setError('Transkription fehlgeschlagen: ' + (e?.message || ''));
      setPhase('idle');
    }
  };

  const meta = DOC_TYPE_META[source] || {};

  return (
    <div className="space-y-2">
      {types.length > 1 && (
        <Tabs value={source} onValueChange={(v) => { setSource(v); setError(null); }}>
          <TabsList className="w-full">
            {types.map(t => (
              <TabsTrigger key={t} value={t} className="flex-1 text-xs">
                {DOC_TYPE_META[t]?.icon} {DOC_TYPE_META[t]?.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {source === 'voice_memo' ? (
        <div className="flex items-center gap-2 flex-wrap">
          {phase === 'recording' ? (
            <Button type="button" variant="destructive" size="sm" onClick={() => mediaRef.current?.stop()} className="gap-2">
              <Square className="w-3.5 h-3.5" /> Aufnahme stoppen
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={startRecording} disabled={disabled || busy} className="gap-2">
              <Mic className="w-3.5 h-3.5" /> Aufnahme starten
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy || phase === 'recording'}
            onClick={() => audioFileRef.current?.click()} className="gap-2">
            <Upload className="w-3.5 h-3.5" /> Audio-Datei hochladen
          </Button>
          <input ref={audioFileRef} type="file" accept="audio/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) transcribeBlob(f); e.target.value = ''; }} />
          {phase === 'transcribing' && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Wird transkribiert…
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" disabled={disabled || busy}
              onClick={() => fileRef.current?.click()} className="gap-2">
              <Upload className="w-3.5 h-3.5" /> {meta.label} als Datei hochladen
            </Button>
            <input ref={fileRef} type="file" accept=".txt,.md,.vtt,.srt,.eml,.pdf,.docx,.doc,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
            {phase === 'reading_file' && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Datei wird gelesen…
              </span>
            )}
          </div>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`…oder ${meta.label} hier einfügen und als Dokument hinzufügen`}
            className="min-h-[80px] text-sm"
            disabled={disabled || busy}
          />
          {pasteText.trim() && (
            <Button type="button" size="sm" onClick={() => addDoc('Eingefügter Text', pasteText)} disabled={disabled || busy} className="gap-2">
              {phase === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Als {meta.label} hinzufügen
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}