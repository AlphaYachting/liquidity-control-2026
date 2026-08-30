import React from 'react';

// Einheitliche Feldüberschrift der Kommunikationskarte — normale Schreibweise.
// Versalien mit Sperrung bleiben der Kartenüberschrift vorbehalten.
export default function FeldTitel({ children }) {
  return <p className="text-[11.5px] font-medium text-muted-foreground mb-1.5">{children}</p>;
}