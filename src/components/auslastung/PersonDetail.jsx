import React from 'react';
import { Link } from 'react-router-dom';
import { PROJECT_TYPES } from '@/components/sprint/projectTypes';
import { fmtH, fmtTag } from '@/lib/auslastung/auslastungRechnung';

const th = 'text-left text-label uppercase text-muted-foreground font-medium px-2 py-1.5';
const td = 'px-2 py-1.5 text-meta';

function monatLabel(m) {
  if (m === 'ueber') return 'Überfällig';
  if (m === 'ohne') return 'Ohne Termin';
  const [j, mo] = m.split('-');
  return new Date(+j, +mo - 1, 1).toLocaleDateString('de-AT', { month: 'short', year: 'numeric' });
}

export default function PersonDetail({ person }) {
  const projekte = [...person.projektListe].sort((a, b) => b.rest - a.rest);
  const monate = Object.keys(person.monate).filter((k) => k !== 'ueber' && k !== 'ohne').sort();
  const spalten = ['ueber', ...monate, 'ohne'].filter((k) => person.monate[k] != null);
  return (
    <div className="bg-canvas px-4 py-3 space-y-4">
      <div className="bg-white rounded border border-border overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-border">
            {['Kunde', 'Projekt', 'Projekttyp', 'Tickets', 'Reststunden', 'Ohne Schätzung', 'Spätester Termin'].map((h) => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {projekte.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className={td}>{p.kunde}</td>
                <td className={td}>{p.link ? <Link to={p.link} className="hover:underline font-medium">{p.titel}</Link> : p.titel}</td>
                <td className={td}>{PROJECT_TYPES[p.typ]?.style?.short || p.typ}</td>
                <td className={td}>{p.tickets}</td>
                <td className={td}>{fmtH(p.rest)} h</td>
                <td className={td}>{p.ohne}</td>
                <td className={td}>{fmtTag(p.bis)}</td>
              </tr>
            ))}
            {projekte.length === 0 && <tr><td className={td} colSpan={7}>Keine Projektarbeit offen.</td></tr>}
          </tbody>
        </table>
      </div>
      {spalten.length > 0 && (
        <div className="bg-white rounded border border-border overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border">{spalten.map((k) => <th key={k} className={th}>{monatLabel(k)}</th>)}</tr></thead>
            <tbody><tr>{spalten.map((k) => <td key={k} className={td}>{fmtH(person.monate[k])} h</td>)}</tr></tbody>
          </table>
        </div>
      )}
    </div>
  );
}