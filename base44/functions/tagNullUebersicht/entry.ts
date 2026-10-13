import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ladeStichtag } from '../../shared/kontingentLaufzeit.js';

// Tag-Null-Sicht (Testbetrieb, nur Admin) — Projektübersicht ab dem Sanierungsstichtag.
// Was vor Tag Null an Stunden und Rechnungen aufgelaufen ist, wird als Altlast eingefroren.
// Ab Tag Null zählt jedes Projekt neu:
//   Restbudget        = Auftragswert − bis zum Vortag verrechnet
//   verbraucht        = alle Stunden ab Tag Null (aWork bis zum Umstellungsstichtag, danach die App)
//   noch gedeckt      = Restbudget in Stunden − verbraucht
//   noch zu verrechnen = Auftragswert − alles Verrechnete
// Eigener Stichtag (Setting tag_null_stichtag, Standard 24.07.2026) — projektintelligenz_messbeginn
// und projektLage bleiben unberührt. Schreibt nichts.
const TAG_NULL_STANDARD = '2026-07-24';
const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
const r0 = (v) => Math.round(Number(v) || 0);
const datum = (v) => String(v || '').slice(0, 10);
// Anzeige in Sätzen: deutsches Zahlenformat
const z1 = (v) => r1(v).toLocaleString('de-AT');
const z0 = (v) => r0(v).toLocaleString('de-AT');
const aufgaben = (n) => `${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'}`;

async function alleSeiten(holen) {
  const out = [];
  let skip = 0;
  while (true) {
    const page = await holen(500, skip);
    out.push(...page);
    if (page.length < 500 || skip > 20000) break;
    skip += 500;
  }
  return out;
}

// Gültig verrechnet: keine Entwürfe und Stornos; versendet oder (auch ohne Versandkennzeichen) bezahlt
const zaehltAlsVerrechnet = (r) =>
  !['draft', 'cancelled'].includes(r.payment_status)
  && (r.is_sent === true || ['paid', 'partially_paid'].includes(r.payment_status));

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Nur für Admins' }, { status: 403 });
    const db = base44.asServiceRole.entities;

    const [tagNullRows, umstellung, satzRows] = await Promise.all([
      db.Setting.filter({ key: 'tag_null_stichtag' }, 'key', 1).catch(() => []),
      ladeStichtag(db),
      db.Setting.filter({ key: 'standard_stundensatz' }, '-updated_date', 1).catch(() => []),
    ]);
    const tagNullWert = datum(tagNullRows[0]?.value);
    const tagNull = /^\d{4}-\d{2}-\d{2}$/.test(tagNullWert) ? tagNullWert : TAG_NULL_STANDARD;
    const standardSatz = Number(satzRows[0]?.value) || 120;

    // 1. Projekte mit festem Auftragswert: Pauschalprojekte und Sprintprojekte, nicht abgeschlossen
    const projekte = (await alleSeiten((l, s) => db.Project.filter({ status: { $ne: 'abgeschlossen' } }, '-created_date', l, s)))
      .filter((p) => p.is_legacy || ['sprint', 'pauschal'].includes(p.abrechnungsmodell));
    if (!projekte.length) return Response.json({ tag_null: tagNull, projekte: {}, summen: null });

    const projektIds = projekte.map((p) => p.id);
    const liqIds = projekte.map((p) => p.liquidity_project_id).filter(Boolean);
    const aworkIds = [...new Set(projekte.map((p) => p.awork_project_id).filter(Boolean))];
    const projektVonLiq = Object.fromEntries(projekte.filter((p) => p.liquidity_project_id).map((p) => [p.liquidity_project_id, p.id]));
    const projektVonAwork = {};
    projekte.forEach((p) => { if (p.awork_project_id && !projektVonAwork[p.awork_project_id]) projektVonAwork[p.awork_project_id] = p.id; });
    const traeger = [...new Set([...projektIds, ...liqIds])];
    const projektVonTraeger = (id) => projektVonLiq[id] || (projektIds.includes(id) ? id : null);

    // 2. Aufträge (AB) am Cockpit oder am Projekt
    const auftraege = (await alleSeiten((l, s) => db.ConfirmedOrder.filter({ project_id: { $in: traeger } }, '-created_date', l, s)))
      .filter((o) => o.status !== 'cancelled');
    const projektVonAuftrag = {};
    const auftragNach = {};
    for (const o of auftraege) {
      const pid = projektVonTraeger(o.project_id);
      if (!pid) continue;
      projektVonAuftrag[o.id] = pid;
      auftragNach[pid] = (auftragNach[pid] || 0) + (Number(o.total_net_amount) || 0);
    }
    const auftragIds = Object.keys(projektVonAuftrag);

    // 3. Rechnungen — am Cockpit/Projekt oder nur am Auftrag; Dubletten über die Id
    const [rgTraeger, rgAuftrag] = await Promise.all([
      alleSeiten((l, s) => db.InvoiceRecord.filter({ project_id: { $in: traeger } }, '-invoice_date', l, s)),
      auftragIds.length ? alleSeiten((l, s) => db.InvoiceRecord.filter({ confirmed_order_id: { $in: auftragIds } }, '-invoice_date', l, s)) : [],
    ]);
    const rechnungen = new Map();
    for (const r of [...rgTraeger, ...rgAuftrag]) {
      const pid = projektVonTraeger(r.project_id) || projektVonAuftrag[r.confirmed_order_id];
      if (pid && !rechnungen.has(r.id)) rechnungen.set(r.id, { ...r, _pid: pid });
    }

    // 4. Stunden ab Tag Null: aWork-Kopie bis zum Umstellungsstichtag, App danach
    const [aworkZeiten, appZeiten, tickets] = await Promise.all([
      aworkIds.length
        ? alleSeiten((l, s) => db.AworkTimeEntry.filter(
          { awork_project_id: { $in: aworkIds }, entry_date: { $gte: tagNull, $lte: umstellung } }, 'entry_date', l, s))
        : [],
      alleSeiten((l, s) => db.TimeEntry.filter({ project_id: { $in: projektIds }, entry_date: { $gte: tagNull } }, 'entry_date', l, s)),
      alleSeiten((l, s) => db.Ticket.filter({ project_id: { $in: projektIds }, status: { $ne: 'erledigt' }, archiviert: { $ne: true } }, 'order', l, s)),
    ]);

    const leer = () => ({
      vor: 0, seit: 0, altforderung: 0, rechnungen_vor: 0, rechnungen_seit: 0, rechnung_ohne_versand: 0,
      awork_min: 0, app_min: 0, letzte: null, offene: 0, offene_soll: 0, offene_mit_soll: 0,
    });
    const acc = Object.fromEntries(projektIds.map((id) => [id, leer()]));

    for (const r of rechnungen.values()) {
      if (!zaehltAlsVerrechnet(r)) continue;
      const a = acc[r._pid];
      const netto = Number(r.net_amount) || 0;
      if (r.is_sent !== true) a.rechnung_ohne_versand += netto;
      if (datum(r.invoice_date) < tagNull) {
        a.vor += netto; a.rechnungen_vor += 1;
        if (['open', 'overdue', 'partially_paid'].includes(r.payment_status)) {
          a.altforderung += Number(r.open_amount) || (r.payment_status === 'partially_paid' ? 0 : netto);
        }
      } else {
        a.seit += netto; a.rechnungen_seit += 1;
      }
    }
    for (const e of aworkZeiten) {
      const pid = projektVonAwork[e.awork_project_id];
      if (!pid) continue;
      acc[pid].awork_min += Number(e.duration_minutes) || 0;
      if (datum(e.entry_date) > (acc[pid].letzte || '')) acc[pid].letzte = datum(e.entry_date);
    }
    const projektNachId = Object.fromEntries(projekte.map((p) => [p.id, p]));
    for (const e of appZeiten) {
      if (e.abrechnungsstatus === 'verworfen') continue;
      const p = projektNachId[e.project_id];
      const d = datum(e.entry_date);
      // Projekte mit aWork-Herkunft: bis einschließlich Umstellungsstichtag zählt aWork, danach die App
      if (!p || (p.awork_project_id && d <= umstellung)) continue;
      acc[p.id].app_min += Number(e.duration_minutes) || (Number(e.hours) || 0) * 60;
      if (d > (acc[p.id].letzte || '')) acc[p.id].letzte = d;
    }
    for (const t of tickets) {
      if (t.rhythmus) continue;
      const a = acc[t.project_id];
      if (!a) continue;
      a.offene += 1;
      if (Number(t.target_hours) > 0) { a.offene_soll += Number(t.target_hours); a.offene_mit_soll += 1; }
    }

    // 5. Je Projekt rechnen
    const ergebnis = {};
    for (const p of projekte) {
      const a = acc[p.id];
      const satz = Number(p.stundensatz) || standardSatz;
      const auftrag = auftragNach[p.id] || Number(p.total_budget) || 0;
      const seitStd = (a.awork_min + a.app_min) / 60;
      // Altstand vor Tag Null: aWork-Gesamtstand des Projekts minus aWork-Stunden ab Tag Null
      const aworkGesamt = Number(p.awork_altstand_stunden) || 0;
      const vorStd = Math.max(0, aworkGesamt - a.awork_min / 60);
      const hinweise = [];
      let ampel, aussage;

      if (!auftrag) {
        ampel = 'kein_massstab';
        aussage = 'Kein Auftragswert hinterlegt — ohne Auftrag kein Restbudget.';
        ergebnis[p.id] = {
          project_id: p.id, ampel, aussage, auftrag: 0, std_seit: r1(seitStd), std_vor: r1(vorStd),
          letzte_buchung: a.letzte, offene_aufgaben: a.offene, hinweise,
        };
        continue;
      }

      const restBudget = Math.max(0, auftrag - a.vor);
      const restStd = restBudget / satz;
      const gedeckt = restStd - seitStd;
      const nochZuVerrechnen = Math.max(0, auftrag - a.vor - a.seit);
      // Ohne aWork-Gesamtstand ist die Altlast nicht bewertbar (Projekt mit aWork-Herkunft, Stand fehlt)
      const altstandFehlt = !!p.awork_project_id && p.awork_altstand_stunden == null;
      const altlast = altstandFehlt ? null : vorStd * satz - a.vor;
      if (altstandFehlt) hinweise.push('aWork-Altstand fehlt — Altlast nicht bewertbar');

      if (a.rechnung_ohne_versand) hinweise.push(`Bezahlte Rechnung ohne Versandkennzeichen mitgezählt (${z0(a.rechnung_ohne_versand)} € netto)`);
      if (a.altforderung > 0) hinweise.push(`Altforderung vor Tag Null offen: ${z0(a.altforderung)} € netto`);
      if (a.vor > auftrag) hinweise.push('Vor Tag Null mehr verrechnet als Auftragswert — Auftrag oder Rechnungszuordnung prüfen');
      if (a.offene && !a.offene_mit_soll) hinweise.push('Offene Aufgaben ohne Sollstunden — Restaufwand unbekannt');

      if (!a.offene && nochZuVerrechnen > 0) {
        ampel = 'abrechnen';
        aussage = `Keine offenen Aufgaben — ${z0(nochZuVerrechnen)} € netto sind noch zu verrechnen.`;
      } else if (!a.offene) {
        ampel = 'gruen';
        aussage = 'Keine offenen Aufgaben, alles verrechnet.';
      } else if (restBudget <= 0) {
        ampel = 'rot';
        aussage = `Schon vor Tag Null voll verrechnet, noch ${aufgaben(a.offene)} offen — jede Stunde ist ungedeckt.`;
      } else if (gedeckt < 0) {
        ampel = 'rot';
        aussage = `Restbudget ab Tag Null aufgebraucht: ${z1(seitStd)} von ${z1(restStd)} Std., noch ${aufgaben(a.offene)} offen.`;
      } else if (a.offene_soll > gedeckt) {
        ampel = 'gelb';
        aussage = `Offene Aufgaben mit ${z1(a.offene_soll)} Std. geplant, gedeckt sind noch ${z1(gedeckt)} Std.`;
      } else if (seitStd > 0.7 * restStd) {
        ampel = 'gelb';
        aussage = `${Math.round((seitStd / restStd) * 100)} % des Restbudgets verbraucht, noch ${aufgaben(a.offene)} offen.`;
      } else {
        ampel = 'gruen';
        aussage = `Noch ${z1(gedeckt)} Std. gedeckt, ${aufgaben(a.offene)} offen.`;
      }

      ergebnis[p.id] = {
        project_id: p.id, ampel, aussage, stundensatz: satz,
        auftrag: r0(auftrag), verrechnet_vor: r0(a.vor), verrechnet_seit: r0(a.seit),
        rest_budget: r0(restBudget), rest_std: r1(restStd), std_seit: r1(seitStd), gedeckt_std: r1(gedeckt),
        noch_zu_verrechnen: r0(nochZuVerrechnen), std_vor: altstandFehlt ? null : r1(vorStd), altlast: altlast === null ? null : r0(altlast),
        altforderung: r0(a.altforderung), letzte_buchung: a.letzte,
        offene_aufgaben: a.offene, offene_soll_std: r1(a.offene_soll), offene_mit_soll: a.offene_mit_soll,
        rechnungen_vor: a.rechnungen_vor, rechnungen_seit: a.rechnungen_seit, hinweise,
      };
    }

    // 6. Summen — laufend und pausiert getrennt
    const summe = (stand) => {
      const zeilen = projekte.filter((p) => (stand === 'pausiert' ? p.status === 'pausiert' : p.status !== 'pausiert'))
        .map((p) => ergebnis[p.id]).filter((z) => z.auftrag > 0);
      const s = (k) => zeilen.reduce((x, z) => x + (Number(z[k]) || 0), 0);
      return {
        projekte: zeilen.length,
        auftrag: r0(s('auftrag')), verrechnet_vor: r0(s('verrechnet_vor')),
        rest_budget: r0(s('rest_budget')), rest_std: r1(s('rest_std')), std_seit: r1(s('std_seit')),
        gedeckt_std: r1(s('gedeckt_std')), noch_zu_verrechnen: r0(s('noch_zu_verrechnen')),
        verrechnet_seit: r0(s('verrechnet_seit')), altlast: r0(s('altlast')), altforderung: r0(s('altforderung')),
        rot: zeilen.filter((z) => z.ampel === 'rot').length,
        gelb: zeilen.filter((z) => z.ampel === 'gelb').length,
        abrechnen: zeilen.filter((z) => z.ampel === 'abrechnen').length,
      };
    };

    return Response.json({
      tag_null: tagNull, umstellung, stundensatz: standardSatz,
      ohne_auftrag: projekte.filter((p) => ergebnis[p.id].ampel === 'kein_massstab' && p.status !== 'pausiert').length,
      summen: { laufend: summe('laufend'), pausiert: summe('pausiert') },
      projekte: ergebnis,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
