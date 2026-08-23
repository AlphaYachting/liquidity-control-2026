import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import IntelligenzListe from '@/components/intelligence/IntelligenzListe';
import WochenberichtKarte from '@/components/intelligence/WochenberichtKarte';
import ProjectIntelligenceSheet from '@/components/projects/ProjectIntelligenceSheet';

const eur = (v) => `€${Math.round(v || 0).toLocaleString('de-AT')}`;

export default function SprintIntelligence() {
  const [offen, setOffen] = useState(null);

  const uebersicht = useQuery({
    queryKey: ['projektIntelligenzUebersicht'],
    queryFn: async () => (await base44.functions.invoke('projektStillstand', {})).data,
  });

  const bericht = useQuery({
    queryKey: ['weeklyIntelligenceReport'],
    queryFn: async () => (await base44.entities.WeeklyIntelligenceReport.list('-report_date', 1))[0] || null,
  });

  const d = uebersicht.data || {};
  const basisSpalten = [
    { label: 'Kunde', get: r => r.customer },
    { label: 'Projekt', get: r => r.project_name },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="Projekt-Intelligence" subtitle="Stehende Übersicht über alle aktiven Projekte" />

      <WochenberichtKarte report={bericht.data} onRefreshed={() => bericht.refetch()} />

      {uebersicht.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-5">
          <IntelligenzListe
            title="Steht still"
            rows={d.stillstand || []}
            onOpen={setOffen}
            columns={[
              ...basisSpalten,
              { label: 'Tage ohne Buchung', align: 'right', get: r => r.tage_seit_buchung === null ? 'nie gebucht' : r.tage_seit_buchung },
              { label: 'Offen netto', align: 'right', get: r => eur(r.open_amount_net) },
              { label: 'Stunden gebucht', align: 'right', get: r => r.gebuchte_stunden },
              { label: 'Aufgaben', align: 'right', get: r => `${r.aufgaben_erledigt}/${r.aufgaben_gesamt}` },
            ]}
          />

          <IntelligenzListe
            title="Budget reisst"
            rows={d.budget || []}
            onOpen={setOffen}
            columns={[
              ...basisSpalten,
              { label: 'Modell', get: r => r.abrechnungsmodell },
              { label: 'Auslastung', align: 'right', get: r => `${r.auslastung_pct}%` },
              { label: 'Aufgabenfortschritt', align: 'right', get: r => r.aufgaben_pct === null ? '—' : `${r.aufgaben_pct}%` },
              { label: 'Offen netto', align: 'right', get: r => eur(r.open_amount_net) },
            ]}
          />

          <IntelligenzListe
            compact
            title="Planwert nicht gepflegt"
            hint="Keine Budget-Ampel möglich"
            rows={d.planwertFehlt || []}
            onOpen={setOffen}
            columns={[
              ...basisSpalten,
              { label: 'Planqualität', get: r => r.planqualitaet },
              { label: 'Stunden gebucht', align: 'right', get: r => r.gebuchte_stunden },
              { label: 'Offen netto', align: 'right', get: r => eur(r.open_amount_net) },
            ]}
          />

          <IntelligenzListe
            title="Abrechnung hinkt"
            rows={d.abrechnung || []}
            onOpen={setOffen}
            columns={[
              ...basisSpalten,
              { label: 'Fortschritt', align: 'right', get: r => `${r.fortschritt_pct}%` },
              { label: 'Abgerechnet', align: 'right', get: r => `${r.abrechnung_pct}%` },
              { label: 'Lücke', align: 'right', get: r => `${r.luecke_pct}%` },
              { label: 'Offen netto', align: 'right', get: r => eur(r.open_amount_net) },
            ]}
          />
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