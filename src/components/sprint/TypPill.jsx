import React from 'react';
import { Zap, Headset, RefreshCw, Archive, Building2 } from 'lucide-react';
import { typeStyleOf } from '@/components/sprint/projectTypes';

const ICONS = { bolt: Zap, headset: Headset, refresh: RefreshCw, archive: Archive, building: Building2 };

// Typ-Pill — zeigt auf jeder Projekt- und Sprintkarte an derselben Stelle, um welche Art Arbeit es geht.
export default function TypPill({ project }) {
  const s = typeStyleOf(project);
  const Icon = ICONS[s.icon] || Zap;

  return (
    <span
      className="inline-flex items-center justify-center gap-1.5 w-[104px] shrink-0 h-6 rounded-full text-[11px] font-semibold uppercase tracking-[0.5px]"
      style={{ backgroundColor: s.pillBg, color: s.pillText }}
    >
      <Icon className="w-3 h-3" />
      {s.short}
    </span>
  );
}