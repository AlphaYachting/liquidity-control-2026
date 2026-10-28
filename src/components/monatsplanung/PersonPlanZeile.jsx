import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import TypPill from '@/components/sprint/TypPill';
import { cn } from '@/lib/utils';
import { fmtH, fmtTag, rolleLabel } from '@/lib/monatsplanung/planRechnung';

const td = 'px-3 py-2.5 text-body align-top';
const klein = 'text-meta text-muted-foreground';

function Zelle({ wert, zusatz, ton }) {
  return (
    <>
      <p className={cn('tabular-nums', ton === 'critical' && 'text-status-critical', ton === 'attention' && 'text-status-attention')}>{wert}</p>
      {zusatz && <p className={klein}>{zusatz}</p>}
    </>
  );
}

const Titel = ({ link, children }) => (link
  ? <Link to={link} className="hover:underline font-medium" onClick={(e) => e.stopPropagation()}>{children}</Link>
  : <span className="font-medium">{children}</span>);

function Block({ titel, hinweis, children, leer }) {
  return (
    <div className="bg-white rounded border border-border min-w-0">
      <div className="px-3 py-2 border-b border-border flex items-baseline gap-2">
        <p className="text-value">{titel}</p>
        {hinweis && <p className={cn(klein, 'truncate')}>{hinweis}</p>}
      </div>
      {leer ? <p className={cn(klein, 'px-3 py-3')}>{leer}</p> : <div className="divide-y divide-[#eeeeee]">{children}</div>}
    </div>
  );
}

function RetainerBlock({ person }) {
  const { retainer, summe } = person;
  return (
    <Block
      titel="Retainer"
      hinweis={retainer.length ? `${retainer.length} · ${fmtH(summe.retainerStd)} h Kontingent${summe.retainerOhne ? ` · ${summe.retainerOhne} ohne Kontingent` : ''}` : null}
      leer={retainer.length ? null : 'Keine Retainer in Projektleitung.'}
    >
      {retainer.map((r) => (
        <div key={r.id} className="px-3 py-2 flex items-center gap-3">
          <TypPill project={r.projekt} />
          <div className="min-w-0 flex-1">
            <p className="truncate"><Titel link={r.link}>{r.titel}</Titel></p>
            <p className={cn(klein, 'truncate')}>{r.kunde}</p>
          </div>
          <p className="tabular-nums shrink-0">{r.kontingent ? `${fmtH(r.kontingent)} h` : <span className={klein}>ohne Kontingent</span>}</p>
        </div>
      ))}
    </Block>
  );
}

function FixBlock({ person }) {
  const { fix, summe } = person;
  return (
    <Block
      titel="Fix im Monat"
      hinweis={fix.length ? `${fix.length} Tickets · ${fmtH(summe.fixStd)} h${summe.fixOhne ? ` · ${summe.fixOhne} ohne Zeitvorgabe` : ''}` : null}
      leer={fix.length ? null : 'Nichts mit Termin in diesem Monat.'}
    >
      {fix.map((f) => (
        <div key={f.id} className="px-3 py-2 flex items-start gap-3">
          <p className={cn('w-12 shrink-0 tabular-nums', f.ueberfaellig ? 'text-status-critical' : 'text-muted-foreground')}>{fmtTag(f.termin)}</p>
          <div className="min-w-0 flex-1">
            <p className="truncate"><Titel link={f.link}>{f.titel}</Titel></p>
            <p className={cn(klein, 'truncate')}>
              {f.kunde} · {f.projektTitel}
              {f.routine && ' · Routine'}
              {f.ueberfaellig && <span className="text-status-critical"> · überfällig</span>}
              {f.geteiltNamen.length > 0 && ` · mit ${f.geteiltNamen.join(', ')}`}
            </p>
          </div>
          <p className="tabular-nums shrink-0 text-right">
            {f.imKontingent
              ? <span className={klein}>im Kontingent</span>
              : f.std == null
                ? <span className={f.aufgebraucht ? 'text-meta text-status-attention' : klein}>{f.aufgebraucht ? 'Vorgabe aufgebraucht' : 'ohne Vorgabe'}</span>
                : `${fmtH(f.std)} h`}
          </p>
        </div>
      ))}
    </Block>
  );
}

function VorratBlock({ person }) {
  const { vorrat, summe, spaeter } = person;
  return (
    <Block
      titel="Vorrat ohne Termin"
      hinweis={vorrat.length ? `${summe.vorratTickets} Tickets · ${fmtH(summe.vorratStd)} h${summe.vorratOhne ? ` · ${summe.vorratOhne} ohne Zeitvorgabe` : ''}${spaeter ? ` · ${spaeter} später terminiert` : ''}` : null}
      leer={vorrat.length ? null : `Kein Vorrat.${spaeter ? ` ${spaeter} Tickets sind später terminiert.` : ''}`}
    >
      {vorrat.map((v) => (
        <div key={v.id} className="px-3 py-2 flex items-center gap-3">
          <TypPill project={v.projekt} />
          <div className="min-w-0 flex-1">
            <p className="truncate"><Titel link={v.link}>{v.titel}</Titel></p>
            <p className={cn(klein, 'truncate')}>{v.kunde}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="tabular-nums">{v.tickets} Tickets</p>
            <p className={klein}>{fmtH(v.std)} h{v.ohne ? ` · ${v.ohne} ohne` : ''}</p>
          </div>
        </div>
      ))}
    </Block>
  );
}

export default function PersonPlanZeile({ person, offen, onToggle, onVerfuegbar, speichert }) {
  const { summe } = person;
  const Pfeil = offen ? ChevronDown : ChevronRight;
  const ueberKapazitaet = person.kapazitaet && summe.gebunden > person.kapazitaet;
  const umverteilen = !person.verfuegbar && (summe.fixTickets > 0 || person.retainer.length > 0);
  return (
    <>
      <tr onClick={onToggle} className={cn('cursor-pointer hover:bg-[#fafafa] border-b border-[#eeeeee]', !person.verfuegbar && 'bg-muted/40')}>
        <td className={td} onClick={(e) => e.stopPropagation()}>
          {person.fremd ? <span className={klein}>—</span> : (
            <Checkbox
              checked={person.verfuegbar}
              disabled={speichert}
              onCheckedChange={(v) => onVerfuegbar(person, v === true)}
              aria-label={`${person.name} verfügbar`}
            />
          )}
        </td>
        <td className={td}>
          <div className="flex items-start gap-1.5">
            <Pfeil className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className={cn('font-medium', !person.verfuegbar && 'text-muted-foreground')}>
                {person.name}
                {person.extern && <span className="ml-2 text-label uppercase px-1.5 py-0.5 rounded border border-border text-muted-foreground">Extern</span>}
              </p>
              <p className={klein}>
                {person.fremd ? 'kein aktives Teammitglied' : person.rollen.map(rolleLabel).join(', ') || '—'}
                {umverteilen && <span className="text-status-attention"> · nicht verfügbar, Arbeit umverteilen</span>}
              </p>
            </div>
          </div>
        </td>
        <td className={td}><Zelle wert={person.retainer.length ? `${fmtH(summe.retainerStd)} h` : '—'} zusatz={person.retainer.length ? `${person.retainer.length} Retainer` : null} /></td>
        <td className={td}>
          <Zelle
            wert={summe.fixTickets ? `${fmtH(summe.fixStd)} h` : '—'}
            zusatz={summe.fixTickets ? [`${summe.fixTickets} Tickets`, summe.fixOhne ? `${summe.fixOhne} ohne Vorgabe` : null, summe.ueberfaellig ? `${summe.ueberfaellig} überfällig` : null].filter(Boolean).join(' · ') : null}
          />
        </td>
        <td className={td}>
          <Zelle
            wert={<span className="font-semibold">{fmtH(summe.gebunden)} h</span>}
            zusatz={person.kapazitaet ? `von ${fmtH(person.kapazitaet)} h vereinbart` : null}
            ton={ueberKapazitaet ? 'critical' : null}
          />
        </td>
        <td className={td}><Zelle wert={summe.vorratTickets ? `${summe.vorratTickets} Tickets` : '—'} zusatz={summe.vorratTickets ? `${fmtH(summe.vorratStd)} h${summe.vorratOhne ? ` · ${summe.vorratOhne} ohne Vorgabe` : ''}` : null} /></td>
      </tr>
      {offen && (
        <tr className="border-b border-[#eeeeee]">
          <td colSpan={6} className="p-0">
            <div className="bg-canvas px-4 py-3 grid grid-cols-1 xl:grid-cols-3 gap-3">
              <RetainerBlock person={person} />
              <FixBlock person={person} />
              <VorratBlock person={person} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
