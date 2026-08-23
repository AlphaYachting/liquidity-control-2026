import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Das Blatt selbst: Überschrift, Schließkreuz, Escape, Fokusfalle, Rückgabe des Fokus.
export default function ErfassungsFenster({ onClose, children }) {
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
        aria-label="Zeit erfassen"
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 right-0 bottom-0 bg-white rounded-t-xl sm:left-auto sm:bottom-24 sm:right-6 sm:w-[420px] sm:rounded-lg shadow-xl max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>
            Zeit erfassen
          </p>
          <button type="button" onClick={onClose} aria-label="Schließen" className="p-1.5 rounded hover:bg-muted">
            <X className="w-4 h-4" style={{ color: RITTLER.textSecondary }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}