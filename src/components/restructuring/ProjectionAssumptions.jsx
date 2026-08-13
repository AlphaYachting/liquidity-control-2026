import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { fmtEUR, fmtPct } from '@/lib/restructuring/restructuringFormat';
import { BUCKET_LABELS } from '@/lib/restructuring/restructuringEngine';

/**
 * Offenlegung der Hochrechnungsannahmen unter der 13-Wochen-Tabelle.
 * Alle Beträge sind Bruttowerte.
 */
export default function ProjectionAssumptions({ projection, receivables, weeks }) {
  const p = projection || {};
  const r = receivables || {};
  const collection = r.collection || {};

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground rounded-lg border border-border bg-muted/30 p-3 space-y-1">
        <p className="font-semibold text-foreground">Hochrechnungs-Basis der Einzahlungen — alle Beträge brutto (inkl. USt)</p>
        <p>
          • <b>Debitoren:</b> nicht fällige Forderungen zum Fälligkeitstermin. Überfällige Forderungen nach
          Einbringlichkeitsquote je Altersklasse:
        </p>
        <ul className="pl-4">
          {Object.entries(collection).map(([k, c]) => (
            <li key={k}>– {BUCKET_LABELS[k]}: {fmtPct(c.rate)} angesetzt, verteilt auf Woche {c.from} bis {c.to}</li>
          ))}
        </ul>
        <p>• <b>Retainer/Hosting:</b> {fmtEUR(p.recurringMonthly)} brutto je Monat aus aktiven Verträgen, jeweils zum Monatsersten.</p>
        <p>
          • <b>Auftragsbestand:</b> {fmtEUR(p.backlogTotal)} offener Leistungswert brutto,
          davon {fmtEUR(p.backlogUndated)} ohne Termin gleichmäßig über {weeks} Wochen,
          {' '}{fmtEUR(p.backlogDated)} zum jeweiligen Erwartungsmonat — gedeckelt auf
          {' '}{p.monthlyCap > 0 ? `${fmtEUR(p.monthlyCap)} je Monat` : 'kein Deckel gepflegt'} und um
          {' '}{p.cashShiftWeeks} Wochen Zahlungsziel nach hinten verschoben.
        </p>
        <p className="text-foreground">
          Die Kapazitätsgrenze liegt bewusst deutlich unter dem historischen Durchschnitt: geplant wird nur, was
          das Team in einem Monat tatsächlich leisten und fakturieren kann. Das ist eine konservative Planung,
          keine Umsatzerwartung.
        </p>
      </div>

      {(r.notApplied > 0.01 || p.backlogNotInHorizon > 0.01 || p.backlogCashAfterHorizon > 0.01 || p.estimatedAssigned > 0.01) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2 text-[11px] text-amber-900">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Nicht angesetzte Beträge — gesondert zu prüfen
          </p>
          {r.notApplied > 0.01 && (
            <div>
              <p>
                <b>{fmtEUR(r.notApplied)}</b> Forderungsvolumen wurde durch die Einbringlichkeitsannahme NICHT als
                Einzahlung angesetzt (von {fmtEUR(r.openTotal)} offen). Dieser Betrag ist als uneinbringlich oder
                strittig einzustufen und gesondert zu prüfen — er verschwindet nicht, er wird nur nicht geplant.
              </p>
              <ul className="pl-4 mt-1">
                {Object.entries(r.notAppliedByBucket || {}).filter(([, v]) => v > 0.01).map(([k, v]) => (
                  <li key={k}>– {BUCKET_LABELS[k]}: {fmtEUR(v)}</li>
                ))}
              </ul>
            </div>
          )}
          {r.outsideHorizon > 0.01 && (
            <p><b>{fmtEUR(r.outsideHorizon)}</b> Forderungen sind erst nach dem Planhorizont fällig.</p>
          )}
          {p.backlogNotInHorizon > 0.01 && (
            <p>
              <b>{fmtEUR(p.backlogNotInHorizon)}</b> Auftragsbestand ist wegen der Kapazitätsgrenze
              <b> nicht im Horizont abbildbar</b> und verschiebt sich über den Planzeitraum hinaus.
            </p>
          )}
          {p.backlogCashAfterHorizon > 0.01 && (
            <p>
              <b>{fmtEUR(p.backlogCashAfterHorizon)}</b> wird zwar im Planzeitraum fakturiert, fließt wegen des
              Zahlungsziels aber erst nach dem Planhorizont zu.
            </p>
          )}
          {p.estimatedAssigned > 0.01 && (
            <p>
              <b>{fmtEUR(p.estimatedAssigned)}</b> der bereits verrechneten Beträge sind {p.estimatedCount} Aufträgen
              nur über den Kundennamen zugeordnet („Zuordnung geschätzt"), nicht über die Auftragsnummer.
            </p>
          )}
        </div>
      )}
    </div>
  );
}