import React from 'react';
import { fmtStd, fmtQuote } from '@/lib/arbeitszeit/auswertung';

function Feld({ label, wert, zusatz, hinweis, link }) {
  return (
    <div className="bg-white rounded border border-border p-4" title={hinweis}>
      <p className="text-label uppercase text-muted-foreground">{label}</p>
      <p className="text-kpi mt-1 tabular-nums">{wert}</p>
      {zusatz && <p className="text-meta text-muted-foreground mt-0.5">{zusatz}</p>}
      {link && (
        <button type="button" onClick={link.onClick} className="text-meta font-semibold underline mt-1 hover:no-underline">
          {link.text}
        </button>
      )}
    </div>
  );
}

// onNvDetails: öffnet bzw. schließt die Detailansicht der nicht verrechenbaren Buchungen
export default function AzKennzahlen({ gesamt, mitApp, nvOffen = false, onNvDetails }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Feld label="Soll" wert={`${fmtStd(gesamt.sollMin)} h`} zusatz="aktive Teammitglieder, ohne Abwesenheit"
        hinweis="Arbeitstage Mo–Fr ohne österreichische Feiertage und ohne gemeldete Abwesenheit × Tagessoll" />
      <Feld label="Erfasst" wert={`${fmtStd(gesamt.erfasstMin)} h`} zusatz={`${fmtQuote(gesamt.erfassungsquote)} vom Soll`}
        hinweis="Gebuchte Zeit inklusive Korrekturen. Das ist nicht die Anwesenheit." />
      <Feld label="Verrechenbar" wert={`${fmtStd(gesamt.verrMin)} h`} zusatz={`${fmtQuote(gesamt.verrQuote)} der erfassten Zeit`} />
      <Feld label="Verrechenbar vom Soll" wert={fmtQuote(gesamt.produktiv)} zusatz="verrechenbare Stunden ÷ Soll"
        hinweis="Die eigentliche Produktivitätskennzahl: wie viel der bezahlten Arbeitszeit verrechenbar ist" />
      <Feld label="Nicht verrechenbar" wert={`${fmtStd(gesamt.nvMin)} h`} zusatz={`${fmtQuote(gesamt.erfasstMin ? gesamt.nvMin / gesamt.erfasstMin : null)} der erfassten Zeit`}
        link={onNvDetails && gesamt.nvMin > 0 ? { text: nvOffen ? 'Details schließen' : 'Projekte und Personen ansehen', onClick: onNvDetails } : null} />
      <Feld label="Mehraufwand" wert={mitApp ? `${fmtStd(gesamt.mehrMin)} h` : '—'} zusatz={mitApp ? 'als Mehraufwand gekennzeichnet' : 'erst ab App-Daten'} />
      <Feld label="Über Kontingent" wert={mitApp ? `${fmtStd(gesamt.ueberMin)} h` : '—'} zusatz={mitApp ? 'Support über dem Monatskontingent' : 'erst ab App-Daten'} />
      <Feld label="Offene Tage" wert={mitApp ? gesamt.offeneTage : '—'} zusatz="Arbeitstage ohne Tagesabschluss" />
    </div>
  );
}
