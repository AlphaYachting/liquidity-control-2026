import React, { useState } from 'react';

// Beschreibung einer Position: zwei Zeilen, per Klick ganz
export default function PositionBeschreibung({ text }) {
  const [offen, setOffen] = useState(false);
  if (!text) return null;
  return (
    <button type="button" onClick={() => setOffen(!offen)}
      className={`block text-left text-xs text-muted-foreground whitespace-pre-line mt-0.5 ${offen ? '' : 'line-clamp-2'}`}>
      {text}
    </button>
  );
}