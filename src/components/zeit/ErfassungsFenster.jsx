import React, { useEffect, useRef } from 'react';
import FensterKopf from './FensterKopf';

// Das Blatt selbst: Überschrift, Schließkreuz, Escape, Fokusfalle, Rückgabe des Fokus.
export default function ErfassungsFenster({ onClose, titel = 'Zeit erfassen', children }) {
  const blatt = useRef(null);
  const ausloeser = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  // onClose entsteht in TimerKnopf bei jedem Rendern neu, und TimerKnopf rendert
  // bei laufendem Timer jede Sekunde. Hängt ein Effekt daran, läuft seine
  // Aufräumfunktion jede Sekunde — und riss damit den Fokus aus dem Notizfeld.
  // Daher: die Schließfunktion über eine Referenz lesen, nie als Abhängigkeit.
  const schliessenRef = useRef(onClose);
  useEffect(() => { schliessenRef.current = onClose; }, [onClose]);

  // Fokus zurückgeben: genau EINMAL, beim echten Schließen.
  useEffect(() => {
    const rueck = ausloeser.current;
    return () => {
      if (rueck && typeof rueck.focus === 'function' && rueck.isConnected) rueck.focus();
    };
  }, []);

  useEffect(() => {
    const felder = () => Array.from(
      blatt.current?.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])') || []
    ).filter((el) => !el.disabled);

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); schliessenRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      const liste = felder();
      if (!liste.length) return;
      const erste = liste[0];
      const letzte = liste[liste.length - 1];
      // Eine Fokusfalle, die den Fokus nicht zurückholt, ist keine: liegt er
      // außerhalb des Blattes, wird er hereingezogen statt weiterwandern zu lassen.
      if (!blatt.current?.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? letzte : erste).focus();
        return;
      }
      if (e.shiftKey && document.activeElement === erste) { e.preventDefault(); letzte.focus(); }
      else if (!e.shiftKey && document.activeElement === letzte) { e.preventDefault(); erste.focus(); }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    // Das Schließen hängt an der Abdunklung, NICHT an der äußeren Hülle: wer Text
    // im Notizfeld markiert und die Maustaste außerhalb löst, erzeugte sonst einen
    // Klick auf die Hülle — das Fenster schloss und die Notiz war weg.
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />
      <div
        ref={blatt}
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-[14px] right-[14px] bottom-0 bg-white rounded-t-xl sm:left-auto sm:bottom-24 sm:right-6 sm:w-[380px] sm:rounded-lg shadow-xl max-h-[85vh] overflow-y-auto"
      >
        <FensterKopf titel={titel} onClose={onClose} />
        {children}
      </div>
    </div>
  );
}