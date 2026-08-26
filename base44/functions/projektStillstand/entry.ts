import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Stehende Übersicht der Projektintelligenz: Stillstand, Budget-Risiko,
// Abrechnungslücke und ungepflegte Planwerte.
// Schreibt nichts und versendet nichts — liefert nur Listen.
const TAG = 86400000;

function planqualitaet(snapshot) {
  const budget = Number(snapshot?.time_budget_minutes) || 0;
  const tracked = Number(snapshot?.tracked_duration_minutes) || 0;
  if (!budget) return 'fehlt';
  if (tracked > 10 * budget) return 'ungepflegt';
  return 'ok';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const projekte = await svc.entities.LiquidityProject.filter(
      { is_active_for_billing: true }, '-created_date', 2000
    );
    const snapshots = await svc.entities.AworkProjectSnapshot.list('-created_date', 3000);
    const snapshotNachId = new Map(snapshots.map(s => [s.awork_project_id, s]));

    // Geld kommt aus den echten Belegen, nicht aus den Excel-Altfeldern des Projekts.
    // Gezählt wird nur, was in sevDesk festgeschrieben und nicht storniert ist;
    // Gutschriften tragen einen negativen Netto und kürzen die Summe von selbst.
    const rechnungen = await svc.entities.InvoiceRecord.list('-invoice_date', 5000);

    // Auftragsvolumen aus den bestätigten Aufträgen — die Vertragsgrundlage.
    const auftraege = await svc.entities.ConfirmedOrder.list('-created_date', 3000);
    const auftragsvolumenNachProjekt = {};
    const projektNachAuftrag = {};
    for (const o of auftraege) {
      if (!o.project_id || o.status === 'cancelled') continue;
      projektNachAuftrag[o.id] = o.project_id;
      auftragsvolumenNachProjekt[o.project_id] = (auftragsvolumenNachProjekt[o.project_id] || 0) + (Number(o.total_net_amount) || 0);
    }

    const abgerechnetNachProjekt = {};
    for (const r of rechnungen) {
      if (r.is_sent !== true) continue;
      if (r.payment_status === 'draft' || r.payment_status === 'cancelled') continue;
      // Viele sevDesk-Rechnungen hängen nur am Auftrag — dann über den Auftrag zuordnen.
      const pid = r.project_id || (r.confirmed_order_id ? projektNachAuftrag[r.confirmed_order_id] : null);
      if (!pid) continue;
      abgerechnetNachProjekt[pid] = (abgerechnetNachProjekt[pid] || 0) + (Number(r.net_amount) || 0);
    }

    // Zeitbuchungen einmal vollständig laden und je awork-Projekt verdichten
    const minutenNachId = {};
    const letzteNachId = {};
    let skip = 0;
    while (true) {
      const page = await svc.entities.AworkTimeEntry.list('-entry_date', 1000, skip);
      for (const e of page) {
        const id = e.awork_project_id;
        if (!id) continue;
        minutenNachId[id] = (minutenNachId[id] || 0) + (Number(e.duration_minutes) || 0);
        if (e.entry_date && (!letzteNachId[id] || e.entry_date > letzteNachId[id])) letzteNachId[id] = e.entry_date;
      }
      if (page.length < 1000) break;
      skip += 1000;
      if (skip > 20000) break;
    }

    const heute = Date.now();
    const stillstand = [];
    const budget = [];
    const planwertFehlt = [];
    const abrechnung = [];

    for (const p of projekte) {
      const snapshot = p.awork_project_id ? snapshotNachId.get(p.awork_project_id) : null;
      const qualitaet = planqualitaet(snapshot);
      const minuten = p.awork_project_id ? (minutenNachId[p.awork_project_id] || 0) : 0;
      const letzte = p.awork_project_id ? (letzteNachId[p.awork_project_id] || null) : null;
      const tage = letzte ? Math.floor((heute - new Date(letzte).getTime()) / TAG) : null;

      // Auftrag schlägt Excel-Altwert; abgerechnet ist ausschliesslich der sevDesk-Belegstand.
      const gesamt = auftragsvolumenNachProjekt[p.id] ?? (Number(p.total_net_amount) || 0);
      const abgerechnet = abgerechnetNachProjekt[p.id] || 0;
      const abrechnungPct = gesamt > 0 ? Math.round((abgerechnet / gesamt) * 100) : 0;
      const offen = Math.max(0, gesamt - abgerechnet);
      const fortschritt = Math.round(
        (Number(p.real_progress_percent) > 0 ? Number(p.real_progress_percent) : 0)
        || Number(snapshot?.progress_percent) || Number(p.awork_progress_percent) || 0
      );
      const aufgabenGesamt = Number(snapshot?.tasks_count) || 0;
      const aufgabenErledigt = Number(snapshot?.tasks_done_count) || 0;
      const aufgabenPct = aufgabenGesamt > 0 ? Math.round((aufgabenErledigt / aufgabenGesamt) * 100) : null;
      const auslastung = qualitaet === 'ok'
        ? Math.round((Number(snapshot.tracked_duration_minutes) / Number(snapshot.time_budget_minutes)) * 100)
        : null;

      const basis = {
        project_id: p.id,
        customer: p.customer || '',
        project_name: p.project_name || '',
        letzte_buchung: letzte,
        tage_seit_buchung: tage,
        auftrag_netto: gesamt,
        abgerechnet_netto: abgerechnet,
        open_amount_net: offen,
        gebuchte_stunden: Math.round((minuten / 60) * 10) / 10,
        aufgaben_erledigt: aufgabenErledigt,
        aufgaben_gesamt: aufgabenGesamt,
        aufgaben_pct: aufgabenPct,
        fortschritt_pct: fortschritt,
        abrechnung_pct: abrechnungPct,
        luecke_pct: fortschritt - abrechnungPct,
        auslastung_pct: auslastung,
        abrechnungsmodell: p.abrechnungsmodell || 'unbekannt',
        planqualitaet: qualitaet,
        budget_ampel_erlaubt: qualitaet === 'ok',
        budget_hinweis: qualitaet === 'ok' ? null : 'Planwert nicht gepflegt',
      };

      // 1. Steht still
      if (offen > 0 && (tage === null || tage >= 14)) {
        stillstand.push({
          ...basis,
          schweregrad: tage === null || tage >= 45 ? 'kritisch' : tage >= 28 ? 'warnung' : 'hinweis',
        });
      }

      // 2. Budget reisst — nur bei gepflegtem Planwert
      if (qualitaet === 'ok') {
        const reisst = (auslastung > 100 && basis.abrechnungsmodell === 'pauschal')
          || (auslastung > 80 && aufgabenPct !== null && aufgabenPct < 60);
        if (reisst) budget.push(basis);
      } else if (offen > 0) {
        planwertFehlt.push(basis);
      }

      // 3. Abrechnung hinkt
      if (offen > 0 && basis.luecke_pct > 20) abrechnung.push(basis);
    }

    stillstand.sort((a, b) => b.open_amount_net - a.open_amount_net);
    budget.sort((a, b) => (b.auslastung_pct || 0) - (a.auslastung_pct || 0));
    abrechnung.sort((a, b) => b.open_amount_net - a.open_amount_net);
    planwertFehlt.sort((a, b) => b.open_amount_net - a.open_amount_net);

    return Response.json({
      geprueft: projekte.length,
      gebundener_betrag_netto: stillstand.reduce((s, b) => s + b.open_amount_net, 0),
      stillstand,
      budget,
      planwertFehlt,
      abrechnung,
      befunde: stillstand,
      befunde_anzahl: stillstand.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}