import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Square, Loader2 } from 'lucide-react';

const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

// Korrektur-/Antwortfeld mit Live-Spracheingabe: gesprochener Text wird
// sofort mitgetippt und kann direkt korrigiert werden.
export default function CorrectionInput({ value, onChange, placeholder, disabled }) {
  const [phase, setPhase] = useState('idle'); // idle | recording | transcribing
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const finalRef = useRef('');
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => () => { recognitionRef.current?.stop?.(); mediaRef.current?.stop?.(); }, []);

  // Live-Diktat über die Browser-Spracherkennung (bevorzugt)
  const startLiveDictation = () => {
    setError(null);
    const rec = new SpeechRec();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = true;
    baseTextRef.current = value ? value.replace(/\s+$/, '') + '\n' : '';
    finalRef.current = '';
    rec.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += t + ' ';
        else interimText += t;
      }
      setInterim(interimText);
      onChange(baseTextRef.current + finalRef.current + interimText);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') setError('Mikrofon-Zugriff nicht erlaubt.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError('Spracherkennung: ' + e.error);
    };
    rec.onend = () => {
      onChange(baseTextRef.current + finalRef.current.replace(/\s+$/, ''));
      setInterim('');
      setPhase('idle');
    };
    recognitionRef.current = rec;
    rec.start();
    setPhase('recording');
  };

  // Fallback: Aufnahme + Transkription, falls der Browser kein Live-Diktat kann
  const startRecordingFallback = async () => {
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

  const start = () => (SpeechRec ? startLiveDictation() : startRecordingFallback());
  const stop = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    else mediaRef.current?.stop();
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`min-h-[70px] text-sm ${phase === 'recording' ? 'ring-2 ring-red-400 border-red-300' : ''}`}
        disabled={disabled || phase === 'transcribing'}
      />
      <div className="flex items-center gap-2 flex-wrap">
        {phase === 'recording' ? (
          <Button type="button" variant="destructive" size="sm" onClick={stop} className="gap-2">
            <Square className="w-3.5 h-3.5" /> Diktat beenden
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={start} disabled={disabled || phase === 'transcribing'} className="gap-2">
            <Mic className="w-3.5 h-3.5" /> Per Sprache antworten
          </Button>
        )}
        {phase === 'recording' && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {SpeechRec ? (interim ? 'Wird geschrieben…' : 'Zuhören… einfach sprechen') : 'Aufnahme läuft…'}
          </span>
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