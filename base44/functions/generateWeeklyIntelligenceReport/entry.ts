import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { berechneFinanzLage, berichtAusLage, kpisAusLage } from '../../shared/finanzRechnung.js';

// Wochenlage — läuft montags früh. Alle Zahlen kommen aus derselben Rechenstelle wie die
// KI-Finanzanalyse (base44/shared/finanzRechnung.js): Tag-Null-Rechnung, Restaufwand aus
// Erfahrungswerten, Einnahmen nach sicher/wahrscheinlich/fraglich, Kapazität, Warnungen.
// Der Text wird aus den Zahlen gebaut, nicht von einer KI formuliert — keine erfundenen Werte.
// Keine Zugriffe auf eingefrorene aWork-Stände als Ist-Daten nach der Umstellung.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const lage = await berechneFinanzLage(svc.entities);
    const kpis = kpisAusLage(lage);
    const heute = lage.stand.heute;
    const titel = `Wochenlage ${heute.split('-').reverse().join('.')}`;

    const record = await svc.entities.WeeklyIntelligenceReport.create({
      report_date: heute,
      title: titel,
      content_markdown: berichtAusLage(lage),
      kpi_json: JSON.stringify(kpis),
      status: 'generated',
    });

    console.log(`Wochenlage ${heute}: ${lage.projekte.length} Projekte, ${lage.warnungen.length} Warnungen, Kalibrierung ${lage.methodik.kalibrierung.quelle}`);
    return Response.json({ success: true, report_id: record.id, kpis });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.WeeklyIntelligenceReport.create({
        report_date: new Date().toISOString().slice(0, 10),
        title: 'Wochenlage — Fehler',
        status: 'error',
        error_message: String(error?.message || error),
      });
    } catch (_) { /* Fehlerprotokoll ist optional */ }
    return Response.json({ error: error.message }, { status: 500 });
  }
});
