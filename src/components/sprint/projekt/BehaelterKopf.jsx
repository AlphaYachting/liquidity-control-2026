import React from 'react';
import KennzahlFeld from '@/components/sprint/KennzahlFeld';
import ProjektKopfTitel from '@/components/sprint/projekt/ProjektKopfTitel';
import { KopfKennzahlLeiste } from '@/components/sprint/KopfKennzahl';
import KontingentFeld from '@/components/sprint/projekt/KontingentFeld';
import LaufzeitSaldoFeld from '@/components/sprint/projekt/LaufzeitSaldoFeld';
import { projectTypeOf, istWartung } from '@/components/sprint/projectTypes';
import { STATUS_COLORS, fmtDate, fmtEUR, todayIso } from '@/components/sprint/sprintConfig';
import { istFaellig, istUeberfaellig } from '@/lib/sprint/faelligkeit';
import { laufenderMonat, monatsName, stundenVon, imMonat, h1, nachFaelligkeit } from '@/lib/sprint/behaelterZahlen';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';

// Kopf für Nicht-Sprint-Projekte: keine Etappen, keine Freigabebeträge.
// Gleicher Aufbau wie beim Sprint: Titelblock mit Verwaltung rechts, darunter die Kennzahlenleiste.
export default function BehaelterKopf({ project, client, tickets, timeEntries, members, vertrag, aktionen }) {
  const typ = projectTypeOf(project);
  const { data: kontext } = useProjektKontext(project?.id);
  const laufzeit = kontext?.summen?.laufzeit;
  const monat = laufenderMonat();
  const mName = monatsName(monat);
  const heute = todayIso();
  const monatsEintraege = imMonat(timeEntries, monat);
  const gebucht = monatsEintraege.reduce((s, e) => s + stundenVon(e), 0);
  const offen = tickets.filter((t) => t.status !== 'erledigt');
  const pm = members.find((m) => m.email === project?.pm_email)
    || (project?.pm_email ? { email: project.pm_email, name: project.pm_email } : null);

  const typText = {
    container: istWartung(project) ? 'Wartungsvertrag' : 'Retainer',
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
          <LaufzeitSaldoFeld
            laufzeit={laufzeit}
            loading={!kontext}
            fehlgrund={!(Number(project?.support_kontingent_stunden) > 0) ? 'Monatskontingent fehlt' : 'Saldo nicht verfügbar'}
          />
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
          <KontingentFeld label={project?.support_kontingent_stunden ? `Rahmen ${mName}` : `Stunden ${mName}`} gebucht={gebucht} kontingent={project?.support_kontingent_stunden} />
          <KennzahlFeld label="Offene Tickets" value={offen.length} />
          <KennzahlFeld label={`Abrechenbar ${mName}`} value={fmtEUR(verrechenbar * (project?.stundensatz || 0))} hint={`${h1(verrechenbar)} h`} />
        </>
      );
    }
    if (typ === 'legacy') {
      // Altprojekt: aWork-Stand bis zur Umstellung (awork_altstand_stunden) plus alle Buchungen in der App
      const ausAwork = Number(project?.awork_altstand_stunden) || 0;
      const inApp = Number(kontext?.summen?.gebucht_gesamt) || 0;
      const gesamt = ausAwork + inApp;
      const budgetH = Number(project?.target_hours) || 0;
      const quote = budgetH ? gesamt / budgetH : 0;
      const farbe = !budgetH ? undefined : quote > 1 ? STATUS_COLORS.critical : quote >= 0.8 ? STATUS_COLORS.attention : undefined;
      const herkunft = project?.awork_altstand_stunden != null
        ? `${h1(ausAwork)} h aus aWork · ${h1(inApp)} h in der App`
        : `${h1(inApp)} h in der App`;
      return (
        <>
          <KennzahlFeld
            label={budgetH ? 'Budget gesamt' : 'Gebucht gesamt'}
            value={!kontext ? '…' : budgetH ? `${h1(gesamt)} von ${h1(budgetH)} h` : `${h1(gesamt)} h`}
            valueColor={farbe}
            hint={kontext ? herkunft : undefined}
            tooltip={budgetH && kontext ? `${Math.round(quote * 100)} % des Budgets verbraucht` : undefined}
          />
          <KennzahlFeld label={`Stunden ${mName}`} value={`${h1(gebucht)} h`} />
          <KennzahlFeld label="Offene Aufgaben" value={offen.length} />
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
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ProjektKopfTitel
          project={project}
          unterzeile={`${client?.name || 'Kunde'} · ${typText}`}
          person={pm}
          personRolle={typ === 'container' ? 'Betreuer' : 'Projektleitung'}
        />
        {aktionen}
      </div>
      <KopfKennzahlLeiste>
        {felder()}
      </KopfKennzahlLeiste>
    </>
  );
}