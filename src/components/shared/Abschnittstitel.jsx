import React from 'react';

// Abschnittstitel mit auslaufender Linie — gliedert eine Seite ohne zusätzliche Box.
export default function Abschnittstitel({ children }) {
  return (
    <p className="flex items-center gap-2.5 text-section uppercase text-muted-foreground after:content-[''] after:flex-1 after:h-px after:bg-border">
      {children}
    </p>
  );
}