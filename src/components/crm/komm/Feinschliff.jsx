import React, { useState } from 'react';

// Die übrigen optionalen Felder stehen hinter einer schmalen Textzeile.
// Sind sie gefüllt, bleiben sie beim nächsten Öffnen sichtbar.
export default function Feinschliff({ gefuellt, children }) {
  const [offen, setOffen] = useState(Boolean(gefuellt));
  if (offen) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => setOffen(true)}
      className="mt-2 text-xs text-primary hover:underline"
    >
      + Feinschliff
    </button>
  );
}