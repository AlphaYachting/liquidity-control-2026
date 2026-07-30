import React from 'react';
import KennzahlFeld from '@/components/sprint/KennzahlFeld';
import { RITTLER, fmtEUR } from '@/components/sprint/sprintConfig';

// X4 Block 4 — nur für Projektmanagement und Geschäftsführung.
export default function UnternehmenBlock({ auslastung4, auslastung8, liquiditaet, pipeline }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[2px] mb-2" style={{ color: RITTLER.pink700 }}>Unternehmen</p>
      <div className="bg-white rounded-lg border border-[#e0e0e0] flex flex-wrap divide-x" style={{ borderColor: RITTLER.line }}>
        <KennzahlFeld label="Auslastung" value={`4 Wochen ${auslastung4} %`} hint={`8 Wochen ${auslastung8} %`} />
        <KennzahlFeld
          label="Liquidität"
          value={liquiditaet[0] ? `KW ${liquiditaet[0].kw}  ${fmtEUR(liquiditaet[0].sum)}` : '—'}
          hint={liquiditaet[1] ? `KW ${liquiditaet[1].kw}  ${fmtEUR(liquiditaet[1].sum)}` : 'keine weitere Etappe geplant'}
        />
        <KennzahlFeld
          label="Pipeline"
          value={`${pipeline.ending} ${pipeline.ending === 1 ? 'Sprint endet' : 'Sprints enden'} in 30 Tagen`}
          hint={`davon ${pipeline.withoutOffer} ohne Folgeangebot`}
        />
      </div>
    </div>
  );
}