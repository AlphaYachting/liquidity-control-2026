import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Square, Loader2 } from 'lucide-react';

// Korrektur-/Antwortfeld mit Spracheingabe (Aufnahme → Transkription → Text anhängen).
export default function CorrectionInput({ value, onChange, placeholder, disabled }) {
  const [phase, setPhase] = useState('idle'); // idle | recording | transcribing
  const [error, setError] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setPhase('transcribing');
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          const file = new File([blob], 'antwort.webm', { type: blob.type });
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          const transcript = await base44.integrations.Core.TranscribeAudio({ audio_url: file_url });
          if (transcript) onChange((value ? value + '\n' : '') + transcript);
        } catch (e) {
          setError('Transkription fehlgeschlagen: ' + (e?.message || ''));
        }
        setPhase('idle');
      };
      mediaRef.current = rec;
      rec.start();
      setPhase('recording');
    } catch {
      setError('Mikrofon-Zugriff nicht möglich.');
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[70px] text-sm"
        disabled={disabled || phase === 'transcribing'}
      />
      <div className="flex items-center gap-2">
        {phase === 'recording' ? (
          <Button type="button" variant="destructive" size="sm" onClick={() => mediaRef.current?.stop()} className="gap-2">
            <Square className="w-3.5 h-3.5" /> Aufnahme stoppen
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={startRecording} disabled={disabled || phase === 'transcribing'} className="gap-2">
            <Mic className="w-3.5 h-3.5" /> Per Sprache antworten
          </Button>
        )}
        {phase === 'transcribing' && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Wird transkribiert…
          </span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}