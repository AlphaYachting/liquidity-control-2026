import { useState, useRef, useEffect } from 'react';

// Live-Spracheingabe: gesprochener Text wird laufend transkribiert und an onText gemeldet.
export default function useSpracheingabe(onText) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const baseRef = useRef('');

  const supported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => () => { recRef.current?.stop?.(); }, []);

  const start = (currentText = '') => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = currentText ? currentText.trimEnd() + ' ' : '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onText(baseRef.current + text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => { recRef.current?.stop(); setListening(false); };

  return { supported, listening, start, stop };
}