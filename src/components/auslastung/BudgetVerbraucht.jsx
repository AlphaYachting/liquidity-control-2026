import React from 'react';
import { fmtH } from '@/lib/auslastung/auslastungRechnung';

const th = 'text-left text-label uppercase text-muted-foreground font-medium px-3 py-2';
const td = 'px-3 py-2 text-body';

// Offene Tickets, deren geleistete Zeit die Planzeit erreicht hat — wahrer Rest muss geschätzt werden
export default function BudgetVerbraucht({ liste }) {
  if (!liste.length) return null;
  return (
    <div className="bg-white rounded border border-border overflow-x-auto">
      <p className="px-3 pt-3 font-semibold text-body">Budget verbraucht, Ticket offen ({liste.length})</p>
      <p className="px-3 text-meta text-muted-foreground">Der wahre Rest ist unbekannt und muss von der zuständigen Person geschätzt werden.</p>
      <table className="w-full mt-2">
        <thead><tr className="border-b border-border">{['Projekt', 'Ticket', 'Person', 'Plan', 'Geleistet'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {[...liste].sort((a, b) => (b.geleistet - b.plan) - (a.geleistet - a.plan)).map((t) => (
            <tr key={t.id} className="border-b border-[#eeeeee] last:border-0">
              <td className={td}>{t.projekt}</td>
              <td className={td}>{t.ticket}</td>
              <td className={td}>{t.person}</td>
              <td className={td}>{fmtH(t.plan)} h</td>
              <td className={td}>{fmtH(t.geleistet)} h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}