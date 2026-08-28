import React from 'react';

// Getroffene Zeichen in Markenfarbe und fett — niemals gelb hinterlegt.
export default function Hervorhebung({ text, eingabe }) {
  const t = String(text || '');
  const q = String(eingabe || '').trim();
  if (!q) return <>{t}</>;
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{t}</>;
  return (
    <>
      {t.slice(0, i)}
      <span className="font-bold text-primary">{t.slice(i, i + q.length)}</span>
      {t.slice(i + q.length)}
    </>
  );
}