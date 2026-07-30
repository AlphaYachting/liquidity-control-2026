import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import SectionLabel from '@/components/sprint/SectionLabel';
import { RITTLER, fmtEUR } from '@/components/sprint/sprintConfig';

function weekStartIso() {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// U6 — Bilanz des Geleisteten, ohne Personenaufschlüsselung und ohne Teamvergleich.
export default function Wochenbilanz() {
  const since = weekStartIso();

  const { data, isLoading } = useQuery({
    queryKey: ['sprintWochenbilanz', since.slice(0, 10)],
    queryFn: async () => {
      const [approvals, tickets] = await Promise.all([
        base44.entities.Approval.filter({ approved_at: { $gte: since } }, '-approved_at', 200),
        base44.entities.Ticket.filter({ status: 'erledigt', last_status_change: { $gte: since } }, '-last_status_change', 500),
      ]);
      return {
        etappen: approvals.length,
        betrag: approvals.reduce((s, a) => s + (a.approved_amount || 0), 0),
        aufgaben: tickets.length,
      };
    },
  });

  if (isLoading || !data) return <Skeleton className="h-28 w-full bg-[#f5f5f5]" />;

  const werte = [
    { value: String(data.etappen), label: 'Etappen' },
    { value: fmtEUR(data.betrag), label: 'abgeschlossen' },
    { value: String(data.aufgaben), label: 'Aufgaben' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <SectionLabel className="mb-3">Diese Woche abgeschlossen</SectionLabel>
      <div className="flex flex-wrap gap-10">
        {werte.map((w) => (
          <div key={w.label}>
            <p className="text-3xl font-extrabold" style={{ color: RITTLER.black }}>{w.value}</p>
            <p className="text-xs mt-0.5" style={{ color: RITTLER.textSecondary }}>{w.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}