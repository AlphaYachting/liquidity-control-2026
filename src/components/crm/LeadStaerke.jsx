import React from 'react';

// Drei Balken statt eines bunten Chips — stark = drei, schwach = einer.
export default function LeadStaerke({ stark }) {
  const gefuellt = stark ? 3 : 1;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`w-2.5 h-1.5 rounded-[1px] ${i < gefuellt ? 'bg-foreground' : 'bg-border'}`} />
      ))}
    </span>
  );
}