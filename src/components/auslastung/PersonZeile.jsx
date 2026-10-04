import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { fmtH, fmtTag, rolleLabel } from '@/lib/auslastung/auslastungRechnung';
import PersonDetail from '@/components/auslastung/PersonDetail';
import { ARTEN } from '@/lib/auslastung/arbeitsart';

const td = 'px-3 py-2.5 text-body align-top';

// arten: offene Reststunden je Arbeitsart; schnitt: ø gebuchte Stunden pro Monat (letzte sechs Monate)
export default function PersonZeile({ person, offen, onToggle, arten, schnitt }) {
  const { projekt, routine, support } = person;
  const Pfeil = offen ? ChevronDown : ChevronRight;
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-[#fafafa] border-b border-[#eeeeee]">
        <td className={td}>
          <div className="flex items-start gap-1.5">
            <Pfeil className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="font-medium">{person.name}</p>
              <p className="text-meta text-muted-foreground">
                {person.fremd ? 'kein aktives Teammitglied' : person.rollen.map(rolleLabel).join(', ') || '—'}
              </p>
            </div>
          </div>
        </td>
        <td className={td}>{projekt.tickets}</td>
        <td className={td}>{fmtH(projekt.plan)} h</td>
        <td className={td}>
          {fmtH(projekt.geleistet)} h
          {projekt.unbekannt > 0 && <p className="text-meta text-status-attention">{projekt.unbekannt} × aWork-Stand unbekannt</p>}
        </td>
        <td className={td}>{fmtH(projekt.rest)} h</td>
        <td className={td}>{projekt.ohne}</td>
        <td className={td}>
          <span className="font-semibold">{fmtH(person.hoch)} h</span>
          {person.unsicher && <span className="ml-1.5 text-label uppercase px-1.5 py-0.5 rounded border border-border text-status-attention">unsicher</span>}
        </td>
        <td className={td}>{person.projektListe.length}</td>
        <td className={td}>{fmtTag(person.bis)}</td>
        <td className={td}>{fmtH(routine.rest)} h / {routine.tickets}</td>
        <td className={td}>{fmtH(support.rest)} h / {support.tickets}</td>
        {ARTEN.map((a) => (
          <td key={a.key} className={td}>
            {fmtH(arten?.[a.key]?.rest)} h
            <p className="text-meta text-muted-foreground">ø {fmtH(schnitt?.[a.key])} h</p>
          </td>
        ))}
        <td className={td}>ø {fmtH(schnitt?.unklar)} h</td>
      </tr>
      {offen && <tr className="border-b border-[#eeeeee]"><td colSpan={18} className="p-0"><PersonDetail person={person} /></td></tr>}
    </>
  );
}