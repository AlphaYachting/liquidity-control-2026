import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import KennzahlFeld from '@/components/sprint/KennzahlFeld';
import TypPill from '@/components/sprint/TypPill';
import KontingentFeld from '@/components/sprint/projekt/KontingentFeld';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { RITTLER, STATUS_COLORS, fmtDate, fmtEUR, todayIso } from '@/components/sprint/sprintConfig';
import { istFaellig, istUeberfaellig } from '@/lib/sprint/faelligkeit';
import { laufenderMonat, monatsName, stundenVon, imMonat, h1, nachFaelligkeit } from '@/lib/sprint/behaelterZahlen';

// Kopf für Nicht-Sprint-Projekte: keine Etappen, keine Freigabebeträge.
export default function BehaelterKopf({ project, client, tickets, timeEntries, members, vertrag }) {
  const typ = projectTypeOf(project);
  const monat = laufenderMonat();
  const mName = monatsName(monat);
  const heute = todayIso();
  const monatsEintraege = imMonat(timeEntries, monat);
  const gebucht = monatsEintraege.reduce((s, e) => s + stundenVon(e), 0);
  const offen = tickets.filter((t) => t.status !== 'erledigt');
  const pmName = members.find((m) => m.email === project?.pm_email)?.name || project?.pm_email || '—';

  const typText = {
    container: `Retainer · Betreuer ${pmName}`,
    support: `Support · ${project?.stundensatz || 0} €/h`,
    regie: ['Regie', `${project?.stundensatz || 0} €/h`, client?.contact_person].filter(Boolean).join(' · '),
    intern: 'Intern',
    legacy: 'Altprojekt',
  }[typ];

  const felder = () => {
    if (typ === 'container') {
      const routinen = offen.filter((t) => t.rhythmus);
      const faellig = routinen.filter((t) => istFaellig(t, heute)).length;
      const ueber = routinen.filter((t) => istUeberfaellig(t, heute)).length;
      const naechste = routinen.filter((t) => t.planned_for).sort(nachFaelligkeit)[0];
      return (
        <>
          <KontingentFeld label={`Kontingent ${mName}`} gebucht={gebucht} kontingent={project?.support_kontingent_stunden} />
          <KennzahlFeld
            label="Routinen"
            value={`${faellig} fällig · ${ueber} überfällig`}
            valueColor={ueber > 0 ? STATUS_COLORS.critical : undefined}
          />
          <KennzahlFeld label="Nächste Fälligkeit" value={naechste ? fmtDate(naechste.planned_for) : '—'} hint={naechste?.title} />
          <KennzahlFeld label="Vertrag" value={vertrag?.monthly_fixed_price ? `${fmtEUR(vertrag.monthly_fixed_price)} / Monat` : '—'} />
        </>
      );
    }
    if (typ === 'support' || typ === 'regie') {
      const verrechenbar = monatsEintraege.filter((e) => e.verrechenbar !== false).reduce((s, e) => s + stundenVon(e), 0);
      return (
        <>
          <KontingentFeld label={`Kontingent ${mName}`} gebucht={gebucht} kontingent={project?.support_kontingent_stunden} />
          <KennzahlFeld label="Offene Tickets" value={offen.length} />
          <KennzahlFeld label={`Abrechenbar ${mName}`} value={fmtEUR(verrechenbar * (project?.stundensatz || 0))} hint={`${h1(verrechenbar)} h`} />
        </>
      );
    }
    return (
      <>
        <KennzahlFeld label={`Stunden ${mName}`} value={`${h1(gebucht)} h`} />
        <KennzahlFeld label="Offene Aufgaben" value={offen.length} />
      </>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-border p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/sprint/projekte" className="hover:text-foreground" style={{ color: RITTLER.textSecondary }}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <TypPill project={project} />
          <div className="min-w-0">
            <h1 className="text-xl font-medium truncate" style={{ color: RITTLER.black }}>{project?.title || 'Projekt'}</h1>
            <p className="text-[13px] uppercase tracking-[0.5px] truncate" style={{ color: RITTLER.textSecondary }}>
              {client?.name || 'Kunde'} · {typText}
            </p>
          </div>
        </div>
        <div className="hidden lg:block w-[160px] h-[56px] shrink-0" aria-hidden="true" />
      </div>
      <div className="flex flex-wrap mt-5 border rounded-md divide-x" style={{ borderColor: RITTLER.line }}>
        {felder()}
      </div>
    </div>
  );
}