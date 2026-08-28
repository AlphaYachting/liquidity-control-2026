import React, { useEffect, useRef } from 'react';
import FensterKopf from './FensterKopf';

// Das Blatt selbst: Überschrift, Schließkreuz, Escape, Fokusfalle, Rückgabe des Fokus.
export default function ErfassungsFenster({ onClose, titel = 'Zeit erfassen', children }) {
  const blatt = useRef(null);
  const ausloeser = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  useEffect(() => {
    const felder = () => Array.from(
      blatt.current?.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])') || []
    ).filter((el) => !el.disabled);

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const liste = felder();
      if (!liste.length) return;
      const erste = liste[0];
      const letzte = liste[liste.length - 1];
      if (e.shiftKey && document.activeElement === erste) { e.preventDefault(); letzte.focus(); }
      else if (!e.shiftKey && document.activeElement === letzte) { e.preventDefault(); erste.focus(); }
    };

    document.addEventListener('keydown', onKey);
    const rueck = ausloeser.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      if (rueck && typeof rueck.focus === 'function') rueck.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25" />
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