import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Square } from 'lucide-react';

// Feedback-Eingabe mit Live-Spracheingabe: gesprochener Text erscheint sofort im Feld.
export default function VoiceFeedbackInput({ value, onChange, placeholder, disabled, rows = 2, textClassName = 'text-xs' }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const baseTextRef = useRef('');

  const supported = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => () => { recRef.current?.stop?.(); }, []);

  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = true;
    baseTextRef.current = value ? value.trimEnd() + ' ' : '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onChange(baseTextRef.current + text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => { recRef.current?.stop(); setListening(false); };

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={`${textClassName} leading-relaxed resize-y`}
        />
        {supported && (
          <Button
            type="button"
            size="icon"
            variant={listening ? 'destructive' : 'outline'}
            onClick={listening ? stop : start}
            disabled={disabled}
            title={listening ? 'Aufnahme stoppen' : 'Feedback einsprechen'}
            className="shrink-0"
          >
            {listening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
        )}
      </div>
      {listening && (
        <p className="text-[10px] text-destructive flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
          Aufnahme läuft — sprich dein Feedback, der Text erscheint live im Feld.
        </p>
      )}
    </div>
  );
}