import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import IntelligenzListe from '@/components/intelligence/IntelligenzListe';
import WochenberichtKarte from '@/components/intelligence/WochenberichtKarte';
import FinanzAuswertungBlock from '@/components/intelligence/FinanzAuswertungBlock';
import ProjectIntelligenceSheet from '@/components/projects/ProjectIntelligenceSheet';

const datum = (d) => (d ? new Date(d).toLocaleDateString('de-AT') : '—');

export default function SprintIntelligence() {
  const [offen, setOffen] = useState(null);

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
  const basisSpalten = [
    { label: 'Kunde', get: r => r.customer },
    { label: 'Projekt', get: r => r.project_name },
  ];

  // Jedes Projekt erscheint nur in der obersten Liste, in der es Handlungsbedarf hat.
  const gezeigt = new Set();
  const einmalig = (rows) => (rows || []).filter(r => {
    if (gezeigt.has(r.project_id)) return false;
    gezeigt.add(r.project_id);
    return true;
  });

  const zusagen = einmalig(h.zusagen);
  const feedback = einmalig(h.feedback);
  const ohneUpdate = einmalig(h.ohneUpdate);
  const stillstand = einmalig(f.stillstand);

  const laedt = handlungen.isLoading || finanzen.isLoading;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="Projekt-Intelligence" subtitle="Was jetzt zu tun ist — je Projekt einmal" />

      <WochenberichtKarte report={bericht.data} onRefreshed={() => bericht.refetch()} />

      {laedt ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-5">
          <IntelligenzListe
            title="Zusagen einhalten"
            hint="Was dem Kunden versprochen wurde"
            rows={zusagen}
            onOpen={setOffen}
            columns={[
              ...basisSpalten,
              { label: 'Zusage', get: r => r.naechste_zusage },
              { label: 'Fällig', get: r => datum(r.faellig_am) },
              {
                label: 'Status', align: 'right',
                get: r => r.tage_ueberfaellig === null ? 'ohne Frist'
                  : r.tage_ueberfaellig > 0 ? `${r.tage_ueberfaellig} Tage überfällig`
                  : `in ${Math.abs(r.tage_ueberfaellig)} Tagen`,
              },
              { label: 'Offen', align: 'right', get: r => r.anzahl },
            ]}
          />

          <IntelligenzListe
            title="Feedback einfordern"
            hint="Aufgaben, die auf eine Rückmeldung warten"
            rows={feedback}
            onOpen={setOffen}
            columns={[
              ...basisSpalten,
              { label: 'Wartet auf', get: r => r.anzahl_kunde > 0 ? `Kunde (${r.anzahl_kunde})` : 'intern' },
              { label: 'Worauf', get: r => r.aufgaben.map(a => a.title).join(', ') },
              { label: 'Längste Wartezeit', align: 'right', get: r => r.laengste_tage === null ? '—' : `${r.laengste_tage} Tage` },
            ]}
          />

          <IntelligenzListe
            title="Projektstand festhalten"
            hint="Es wird gearbeitet, aber niemand hat den Stand dokumentiert"
            rows={ohneUpdate}
            onOpen={setOffen}
            columns={[
              ...basisSpalten,
              { label: 'Verantwortlich', get: r => r.project_manager || '—' },
              { label: 'Letzte Arbeit', get: r => datum(r.letzte_buchung) },
              {
                label: 'Letzter Eintrag', align: 'right',
                get: r => r.tage_ohne_eintrag === null ? 'nie' : `vor ${r.tage_ohne_eintrag} Tagen`,
              },
            ]}
          />

          <IntelligenzListe
            title="Steht still"
            hint="Keine Arbeit mehr gebucht"
            rows={stillstand}
            onOpen={setOffen}
            columns={[
              ...basisSpalten,
              { label: 'Verantwortlich', get: r => r.project_manager || '—' },
              { label: 'Letzte Arbeit', get: r => datum(r.letzte_buchung) },
              { label: 'Tage ohne Buchung', align: 'right', get: r => r.tage_seit_buchung === null ? 'nie gebucht' : r.tage_seit_buchung },
              { label: 'Aufgaben', align: 'right', get: r => `${r.aufgaben_erledigt}/${r.aufgaben_gesamt}` },
            ]}
          />

          <FinanzAuswertungBlock daten={f} onOpen={setOffen} />
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