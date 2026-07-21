import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mic, Square, Loader2, Upload } from 'lucide-react';
import { extractDocxText } from '@/components/crm/quotes/docxText';

export default function NotesCaptureBar({ disabled, onAppend }) {
  const [source, setSource] = useState('transcript');
  const [phase, setPhase] = useState('idle'); // idle | recording | transcribing | reading_file
  const [error, setError] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const audioFileRef = useRef(null);
  const transcriptFileRef = useRef(null);
  const busy = ['transcribing', 'reading_file'].includes(phase);

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
        onAppend(res.output?.transcript_text || (Array.isArray(res.output) ? res.output.map(o => o.transcript_text).join('\n') : ''));
      } else if (/\.docx$/i.test(file.name)) {
        onAppend(await extractDocxText(file));
      } else if (/\.doc$/i.test(file.name)) {
        throw new Error('Bitte die Datei als .docx speichern (altes .doc-Format wird nicht unterstützt)');
      } else {
        onAppend(await file.text());
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

  const transcribeBlob = async (file) => {
    setPhase('transcribing');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const transcript = await base44.integrations.Core.TranscribeAudio({ audio_url: file_url });
      onAppend(transcript || '');
      setPhase('idle');
    } catch (e) {
      setError('Transkription fehlgeschlagen: ' + (e?.message || ''));
      setPhase('idle');
    }
  };

  return (
    <div className="space-y-2">
      <Tabs value={source} onValueChange={setSource}>
        <TabsList className="w-full">
          <TabsTrigger value="transcript" className="flex-1">📝 Transkript</TabsTrigger>
          <TabsTrigger value="email" className="flex-1">✉️ Kunden-E-Mail</TabsTrigger>
          <TabsTrigger value="voice_memo" className="flex-1">🎙️ Sprachmemo</TabsTrigger>
        </TabsList>
      </Tabs>

      {source === 'transcript' && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy}
            onClick={() => transcriptFileRef.current?.click()} className="gap-2">
            <Upload className="w-3.5 h-3.5" /> Transkriptdatei hochladen
          </Button>
          <input ref={transcriptFileRef} type="file" accept=".txt,.md,.vtt,.srt,.pdf,.docx,.doc,text/plain" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTranscriptFile(f); e.target.value = ''; }} />
          {phase === 'reading_file' && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Datei wird gelesen…
            </span>
          )}
        </div>
      )}

      {source === 'email' && (
        <p className="text-[11px] text-muted-foreground">Kunden-E-Mail einfach unten ins Textfeld einfügen.</p>
      )}

      {source === 'voice_memo' && (
        <div className="flex items-center gap-2">
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
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}