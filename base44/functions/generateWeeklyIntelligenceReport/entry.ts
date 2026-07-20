import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Wöchentlicher automatischer Lagebericht der Projektintelligence:
// sammelt Ist-Daten (Projekte, awork, Rechnungen, offene Stunden, Empfehlungen,
// Rückfragen), lässt daraus einen kompakten Markdown-Bericht generieren und
// speichert ihn als WeeklyIntelligenceReport. Rein additiv — keine Änderungen
// an bestehenden Daten außer dem neuen Berichts-Datensatz.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const today = new Date().toISOString().substring(0, 10);

    // 1. Aktive Projekte + awork-Snapshots
    const projects = await svc.entities.LiquidityProject.filter({ is_active_for_billing: true }, null, 500);
    const aworkIds = projects.map(p => p.awork_project_id).filter(Boolean);
    const snapshots = aworkIds.length > 0
      ? await svc.entities.AworkProjectSnapshot.filter({ awork_project_id: { $in: aworkIds } }, null, 500)
      : [];
    const snapById = {};
    for (const s of snapshots) snapById[s.awork_project_id] = s;

    // 2. Offene verrechenbare Stunden je Projekt
    const openEntries = await svc.entities.AworkTimeEntry.filter({ is_billable: true, is_billed: false }, null, 2000);
    const openMinutes = {};
    const lastEntryDate = {};
    for (const e of openEntries) {
      if (!e.awork_project_id) continue;
      openMinutes[e.awork_project_id] = (openMinutes[e.awork_project_id] || 0) + (e.duration_minutes || 0);
      if (!lastEntryDate[e.awork_project_id] || (e.entry_date || '') > lastEntryDate[e.awork_project_id]) {
        lastEntryDate[e.awork_project_id] = e.entry_date || '';
      }
    }

    // 3. Kennzahlen je Projekt
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().substring(0, 10);
    const rows = projects.map(p => {
      const snap = p.awork_project_id ? snapById[p.awork_project_id] : null;
      const total = p.total_net_amount || 0;
      const invoiced = p.already_invoiced_amount || 0;
      const billingPct = total > 0 ? Math.round((invoiced / total) * 100) : 0;
      const progress = (p.real_progress_percent > 0 ? p.real_progress_percent : null)
        ?? snap?.progress_percent ?? p.awork_progress_percent ?? 0;
      const budgetUtil = snap && snap.time_budget_minutes > 0
        ? Math.round((snap.tracked_duration_minutes / snap.time_budget_minutes) * 100)
        : null;
      const openHours = p.awork_project_id ? Math.round((openMinutes[p.awork_project_id] || 0) / 60) : 0;
      const stale = p.awork_project_id && (p.open_amount || 0) > 0 &&
        (!lastEntryDate[p.awork_project_id] || lastEntryDate[p.awork_project_id] < twoWeeksAgo);
      return {
        kunde: p.customer, projekt: p.project_name,
        auftrag_netto: total, offen_netto: p.open_amount || 0,
        fortschritt_pct: Math.round(progress), abrechnung_pct: billingPct,
        luecke_pct: Math.round(progress - billingPct),
        budget_auslastung_pct: budgetUtil, offene_stunden: openHours,
        risiko: p.risk_status || 'none', stagniert: !!stale,
        notiz_naechste_rechnung: p.notes_next_invoice || '',
      };
    });

    const quickWins = rows.filter(r => r.luecke_pct > 20 && r.offen_netto > 0);
    const budgetCritical = rows.filter(r => r.budget_auslastung_pct !== null && r.budget_auslastung_pct > 100);
    const stagnating = rows.filter(r => r.stagniert);

    // 4. Überfällige Rechnungen
    const openInvoices = await svc.entities.InvoiceRecord.filter(
      { payment_status: { $in: ['open', 'partially_paid', 'overdue'] } }, null, 1000);
    const overdue = openInvoices.filter(i =>
      i.payment_status === 'overdue' || (i.due_date && i.due_date < today));
    const overdueSum = overdue.reduce((s, i) => s + (i.open_amount || i.gross_amount || 0), 0);

    // 5. Offene Empfehlungen & unbeantwortete Rückfragen
    const openRecs = await svc.entities.AdvisorRecommendation.filter({ status: 'open' }, null, 200).catch(() => []);
    const openInquiries = await svc.entities.ProjectInquiry.filter({ status: 'sent' }, null, 200).catch(() => []);

    // 6. Stundensatz für Euro-Bewertung
    const settings = await svc.entities.RestructuringSetting.list(null, 1).catch(() => []);
    const hourlyRate = settings[0]?.wip_blended_hourly_rate || 100;
    const totalOpenHours = rows.reduce((s, r) => s + r.offene_stunden, 0);

    const kpis = {
      quick_win_potenzial_netto: Math.round(quickWins.reduce((s, r) => s + r.offen_netto, 0)),
      quick_wins: quickWins.length,
      budget_kritisch: budgetCritical.length,
      stagnierend: stagnating.length,
      ueberfaellig_summe: Math.round(overdueSum),
      ueberfaellig_anzahl: overdue.length,
      offene_stunden: totalOpenHours,
      offene_stunden_wert_netto: Math.round(totalOpenHours * hourlyRate),
      offene_empfehlungen: openRecs.length,
      unbeantwortete_rueckfragen: openInquiries.length,
    };

    // 7. Bericht generieren
    const prompt = `Du bist die "Rittler und Co Projektintelligence" einer österreichischen Digitalagentur. Heute ist ${today}. Erstelle den wöchentlichen Lagebericht als kompaktes Markdown-Dokument auf Deutsch.

Kennzahlen: ${JSON.stringify(kpis)}

Quick-Win-Projekte (Fortschritt deutlich vor Abrechnung, sofort abrechenbar): ${JSON.stringify(quickWins.slice(0, 15))}

Budget-kritische Projekte (Budget überschritten): ${JSON.stringify(budgetCritical.slice(0, 10))}

Stagnierende Projekte (keine Zeitbuchung seit 14+ Tagen, offenes Volumen): ${JSON.stringify(stagnating.slice(0, 10))}

Überfällige Rechnungen (Top): ${JSON.stringify(overdue.slice(0, 10).map(i => ({ kunde: i.customer_name, nr: i.invoice_number, offen: i.open_amount || i.gross_amount, faellig: i.due_date })))}

Offene Empfehlungen aus Vorwochen: ${JSON.stringify(openRecs.slice(0, 10).map(r => ({ kunde: r.customer, projekt: r.project_name, empfehlung: r.recommendation_text, betrag: r.amount_net, seit: r.recommended_at })))}

Unbeantwortete Rückfragen an Umsetzer: ${JSON.stringify(openInquiries.slice(0, 10).map(q => ({ kunde: q.customer, projekt: q.project_name, empfaenger: q.recipient_name, seit: q.sent_at })))}

Struktur des Berichts:
1. KPI-Zeile oben (Potenzial €, Quick-Wins, Budget-kritisch, Überfällig €, Offene Stunden mit €-Wert bei ${hourlyRate}€/h)
2. "⚡ Sofort abrechenbar" — Quick-Wins mit Kunde, Projekt, Betrag, Lücke
3. "🔴 Budget & Risiken" — kritische und stagnierende Projekte
4. "💶 Forderungen" — überfällige Rechnungen
5. "📋 Nachverfolgung" — offene Empfehlungen und unbeantwortete Rückfragen aus Vorwochen
6. "🎯 Top-3-Prioritäten dieser Woche" — konkrete Handlungen mit Beträgen
Kompakt, Tabellen wo sinnvoll, konkrete Eurobeträge, keine Floskeln.`;

    const content = await svc.integrations.Core.InvokeLLM({ prompt });

    const record = await svc.entities.WeeklyIntelligenceReport.create({
      report_date: today,
      title: `Wochenbericht ${new Date().toLocaleDateString('de-AT')}`,
      content_markdown: typeof content === 'string' ? content : JSON.stringify(content),
      kpi_json: JSON.stringify(kpis),
      status: 'generated',
    });

    return Response.json({ success: true, report_id: record.id, kpis });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});