import React from 'react';

// Kleines pinkes Sektionslabel in Großbuchstaben (Design-System Rittler)
export default function SectionLabel({ children, className = '' }) {
  return (
    <p className={`text-[11px] font-bold uppercase text-[#d12d52] tracking-[2px] ${className}`}>
      {children}
    </p>
  );
}