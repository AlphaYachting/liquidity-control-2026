import React from 'react';

// K4 — Ampelpunkt: 8px, genau drei Zustände
const COLORS = {
  gruen: '#45d085',
  gelb: '#f5a623',
  pink: '#ff3764',
};

export default function Ampelpunkt({ status = 'gruen', className = '' }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${className}`}
      style={{ backgroundColor: COLORS[status] || COLORS.gruen }}
    />
  );
}