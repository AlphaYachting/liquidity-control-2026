import React from 'react';

// Einheitliche Feldüberschrift der Kommunikationskarte.
export default function FeldTitel({ children }) {
  return (
    <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-1.5">
      {children}
    </p>
  );
}