import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import Seitenkopf from '@/components/shared/Seitenkopf';
import Abschnittstitel from '@/components/shared/Abschnittstitel';
import Kennzahlleiste from '@/components/shared/Kennzahlleiste';
import { Skeleton } from '@/components/ui/skeleton';
import IntelligenzListe from '@/components/intelligence/IntelligenzListe';
import WochenberichtKarte from '@/components/intelligence/WochenberichtKarte';
import FinanzAuswertungBlock from '@/components/intelligence/FinanzAuswertungBlock';
import ProjectIntelligenceSheet from '@/components/projects/ProjectIntelligenceSheet';

const datum = (d) => (d ? new Date(d).toLocaleDateString('de-AT') : '—');
const eur = (v) => `€${Math.round(v || 0).toLocaleString('de-AT')}`;

export default function SprintIntelligence() {
  const [offen, setOffen] = useState(null);
  const [finanzOffen, setFinanzOffen] = useState(0);

  const finanzen = useQuery({
    queryKey: ['projektIntelligenzUebersicht'],
    queryFn: async () => (await base44.functions.invoke('projektStillstand', {})).data,
  });

  const handlungen = useQuery({
    queryKey: ['projektHandlungsbedarf'],
    queryFn: async () => (await base44.functions.invoke('projektHandlungsbedarf', {})).data,
  });

  const bericht = useQuery({
    queryKey: ['weeklyIntelligenceReport'],
    queryFn: async () => (await base44.entities.WeeklyIntelligenceReport.list('-report_date', 1))[0] || null,
  });

  const h = handlungen.data || {};
  const f = finanzen.data || {};

  // Jedes Projekt erscheint nur in der obersten Liste, in der es Handlungsbedarf hat.
  const gezeigt = new Set();
  const einmalig = (rows) => (rows || []).filter(r => {
    if (gezeigt.has(r.project_id)) return false;
    gezeigt.add(r.project_id);
    return true;
  });

  const feedback = einmalig(h.feedback);
  const ohneUpdate = einmalig(h.ohneUpdate);
  const stillstand = einmalig(f.stillstand);
  const zusagen = einmalig(h.zusagen);

  const springen = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const feld = (label, anzahl, hinweis, id) => ({
    label,
    wert: anzahl,
    hinweis: anzahl > 0 ? hinweis : 'nichts offen',
    ton: anzahl > 0 ? 'attention' : 'done',
    onClick: () => springen(id),
  });

  const ueberfaellig = zusagen.filter(z => (z.tage_ueberfaellig ?? 0) > 0).length;
  const laengste = feedback.reduce((m, r) => Math.max(m, r.laengste_tage || 0), 0);
  const abrechnung = f.abrechnung || [];
  const budget = f.budget || [];
  const abrechnungOffen = abrechnung.reduce((s, r) => s + (r.open_amount_net || 0), 0);

  const listen = [
    {
      key: 'feedback', id: 'liste-feedback', rows: feedback,
      title: 'Feedback einfordern', hint: 'Aufgaben, die auf eine Rückmeldung warten',
      zeile: (r) => ({
        label: `${r.project_name} · wartet ${r.anzahl_kunde > 0 ? `auf Kunde (${r.anzahl_kunde})` : 'intern'}`,
        zusatz: r.aufgaben.map(a => a.title).join(' · '),
        wert: r.laengste_tage === null ? '—' : `${r.laengste_tage} Tage`,
        wertHinweis: 'längste Wartezeit',
      }),
    },
    {
      key: 'stand', id: 'liste-stand', rows: ohneUpdate,
      title: 'Projektstand festhalten', hint: 'Es wird gearbeitet, aber niemand hat den Stand dokumentiert',
      zeile: (r) => ({
        label: `${r.project_name} · ${r.project_manager || 'ohne PM'}`,
        zusatz: `letzte Arbeit ${datum(r.letzte_buchung)}`,
        wert: r.tage_ohne_eintrag === null ? 'nie' : `vor ${r.tage_ohne_eintrag} Tagen`,
        wertHinweis: 'letzter Eintrag',
      }),
    },
    {
      key: 'still', id: 'liste-still', rows: stillstand,
      title: 'Steht still', hint: 'Keine Arbeit mehr gebucht',
      zeile: (r) => ({
        label: `${r.project_name} · ${r.project_manager || 'ohne PM'}`,
        zusatz: `Aufgaben ${r.aufgaben_erledigt}/${r.aufgaben_gesamt} · ${eur(r.open_amount_net)} offen`,
        wert: r.tage_seit_buchung === null ? 'nie gebucht' : `${r.tage_seit_buchung} Tage`,
        wertHinweis: 'ohne Buchung',
      }),
    },
    {
      key: 'zusagen', id: 'liste-zusagen', rows: zusagen,
      title: 'Zusagen einhalten', hint: 'Was dem Kunden versprochen wurde',
      zeile: (r) => ({
        label: `${r.project_name}${r.anzahl > 1 ? ` · ${r.anzahl} Zusagen` : ''}`,
        zusatz: r.naechste_zusage,
        wert: r.tage_ueberfaellig === null ? 'ohne Frist'
          : r.tage_ueberfaellig > 0 ? `${r.tage_ueberfaellig} Tage überfällig`
          : `in ${Math.abs(r.tage_ueberfaellig)} Tagen`,
        wertHinweis: r.faellig_am ? `fällig ${datum(r.faellig_am)}` : '',
      }),
    },
  ];

  // Listen mit Einträgen zuerst, leere danach.
  const sortiert = [...listen].sort((a, b) => (b.rows.length > 0) - (a.rows.length > 0));

  const laedt = handlungen.isLoading || finanzen.isLoading;

  return (
    <div className="max-w-[1200px] space-y-4">
      <Seitenkopf
        bereich="Sprint-Modul"
        titel="Projekt-Intelligence"
        kontext="Was jetzt zu tun ist, je Projekt einmal"
      />

      <Kennzahlleiste
        werte={[
          feld('Zusagen', zusagen.length, `${ueberfaellig} überfällig`, 'liste-zusagen'),
          feld('Feedback', feedback.length, `längste ${laengste} Tage`, 'liste-feedback'),
          feld('Stand fehlt', ohneUpdate.length, 'ohne Eintrag', 'liste-stand'),
          feld('Steht still', stillstand.length, `${eur(f.gebundener_betrag_netto)} gebunden`, 'liste-still'),
          {
            ...feld('Abrechnung hinkt', abrechnung.length, `${eur(abrechnungOffen)} offen`, 'finanzauswertung'),
            onClick: () => { setFinanzOffen(n => n + 1); springen('finanzauswertung'); },
          },
          {
            ...feld('Budget reißt', budget.length, 'über 100 %', 'finanzauswertung'),
            onClick: () => { setFinanzOffen(n => n + 1); springen('finanzauswertung'); },
          },
        ]}
      />

      {laedt ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] gap-4 items-start">
          <div className="space-y-4">
            <Abschnittstitel>Handeln</Abschnittstitel>
            {sortiert.map(l => (
              <IntelligenzListe
                key={l.key}
                id={l.id}
                title={l.title}
                hint={l.hint}
                rows={l.rows}
                zeile={l.zeile}
                onOpen={setOffen}
              />
            ))}
            <FinanzAuswertungBlock daten={f} onOpen={setOffen} offenErzwingen={finanzOffen} />
          </div>

          <div className="space-y-4 lg:sticky lg:top-20">
            <Abschnittstitel>Wochenbericht</Abschnittstitel>
            <WochenberichtKarte report={bericht.data} onRefreshed={() => bericht.refetch()} />
          </div>
        </div>
      )}

      {offen && (
        <ProjectIntelligenceSheet
          open={!!offen}
          onClose={() => setOffen(null)}
          projectId={offen.project_id}
          projectName={offen.project_name}
          customer={offen.customer}
        />
      )}
    </div>
  );
}