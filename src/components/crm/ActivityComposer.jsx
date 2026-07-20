import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff } from 'lucide-react';

export default function ActivityComposer({ dealId, onAdded }) {
  const [type, setType] = useState('note');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = 'de-AT';
    rec.continuous = true;
    rec.interimResults = true;
    const base = content ? content.trim() + ' ' : '';
    let finalTranscript = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      setContent(base + finalTranscript + interim);
    };
    rec.onend = () => {
      if (recognitionRef.current?._shouldRestart) {
        try { rec.start(); } catch {}
      } else {
        setIsRecording(false);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech') return;
      setIsRecording(false);
    };
    rec._shouldRestart = true;
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current._shouldRestart = false;
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const add = async () => {
    if (!content.trim()) return;
    if (isRecording) stopRecording();
    setSaving(true);
    try {
      await base44.entities.CrmActivity.create({
        deal_id: dealId,
        activity_type: type,
        content: content.trim(),
        activity_date: new Date().toISOString(),
      });
      setContent('');
      onAdded?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
      <div className="flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="note">📝 Notiz</SelectItem>
            <SelectItem value="call">📞 Anruf</SelectItem>
            <SelectItem value="email">✉️ E-Mail</SelectItem>
            <SelectItem value="meeting">📅 Termin</SelectItem>
          </SelectContent>
        </Select>
        {speechSupported && (
          <Button
            size="sm"
            variant={isRecording ? 'destructive' : 'outline'}
            className="ml-auto h-8 gap-1.5"
            onClick={isRecording ? stopRecording : startRecording}
            title={isRecording ? 'Aufnahme stoppen' : 'Diktat starten'}
          >
            {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {isRecording ? 'Stopp' : 'Diktat'}
          </Button>
        )}
        <Button size="sm" className={`h-8 ${speechSupported ? '' : 'ml-auto'}`} onClick={add} disabled={saving || !content.trim()}>
          {saving ? 'Speichert…' : 'Erfassen'}
        </Button>
      </div>
      <Textarea rows={2} value={content} onChange={e => setContent(e.target.value)}
        placeholder="Was ist passiert? (z.B. Telefonat geführt, Kunde meldet sich nächste Woche)"
        className={`bg-background text-sm ${isRecording ? 'ring-2 ring-red-300' : ''}`} />
      {isRecording && (
        <p className="text-[11px] text-red-600 font-medium flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Aufnahme läuft — sprechen Sie jetzt
        </p>
      )}
    </div>
  );
}