import React from 'react';
import { CheckCircle2, AlertTriangle, Archive, TrendingUp } from 'lucide-react';

export default function ResetReport({ log, classified, reconciled, activeRows }) {
  const ok = (log || []).filter(r => r.status === 'ok').length;
  const errors = (log || []).filter(r => r.status === 'error').length;
  const archived = (classified || []).filter(c => ['archived', 'not_billing_relevant', 'inactive'].includes(c.effectiveRelevance)).length;
  const active = (classified || []).filter(c => c.effectiveRelevance === 'active_billing_relevant').length;
  const future = (classified || []).filter(c => c.effectiveRelevance === 'future_billing_relevant').length;
  const review = (classified || []).filter(c => c.effectiveRelevance === 'needs_review').length;
  const critical = (reconciled || []).filter(r => r.overallStatus === 'critical').length;
  const warnings = (reconciled || []).filter(r => r.overallStatus === 'warning').length;

  const kpis = [
    { label: 'Aktive Abrechnungsprojekte', value: active, color: 'text-emerald-700', bg: 'bg-emerald-50' },
    { label: 'Zukunfts-Abrechnung', value: future, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Zur Prüfung', value: review, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Archiviert/Nicht relevant', value: archived, color: 'text-gray-600', bg: 'bg-gray-50' },
    { label: 'Kritische Differenzen', value: critical, color: 'text-red-700', bg: 'bg-red-50' },
    { label: 'Warnungen', value: warnings, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Aktionen gesamt', value: ok + errors, color: 'text-primary', bg: 'bg-primary/5' },
    { label: 'Fehler', value: errors, color: errors > 0 ? 'text-red-700' : 'text-emerald-700', bg: errors > 0 ? 'bg-red-50' : 'bg-emerald-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-100">
          <CheckCircle2 className="w-6 h-6 text-emerald-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Datenbasis bereinigt</h2>
          <p className="text-sm text-muted-foreground">Aktiver Abrechnungsdatensatz am PM-Excel-Sheet und Verrechnungssystem ausgerichtet.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`${k.bg} border rounded-xl p-4 text-center`}>
            <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {critical > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-800 font-semibold mb-2">
            <AlertTriangle className="w-4 h-4" />
            {critical} kritische Finanzabweichung{critical !== 1 ? 'en' : ''} offen
          </div>
          <p className="text-sm text-red-700">
            Diese Projekte zeigen eine Differenz &gt; €50 zwischen Excel-Planwerten und tatsächlichen InvoiceRecords.
            Bitte prüfe diese Projekte im Projekt-Cockpit und im Verrechnungsprogramm.
          </p>
        </div>
      )}

      <div className="bg-muted/40 border rounded-xl p-4 text-sm space-y-2">
        <p className="font-semibold">Nächste empfohlene Schritte:</p>
        <ul className="space-y-1 text-muted-foreground">
          {review > 0 && <li>• {review} Projekte "Prüfung nötig" im Projekt-Cockpit prüfen</li>}
          {critical > 0 && <li>• {critical} kritische Rechnungsdifferenzen klären und ggf. Rechnungen manuell zuordnen</li>}
          <li>• Projekt-Cockpit zeigt nun nur aktive / zukunftsrelevante Projekte</li>
          <li>• Archivierte Projekte über den Filter "Archiviert" weiterhin zugänglich</li>
          <li>• Abrechnungspläne (aktueller/nächster Monat) wurden aus Excel aktualisiert</li>
        </ul>
      </div>
    </div>
  );
}