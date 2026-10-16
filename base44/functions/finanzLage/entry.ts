import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { berechneFinanzLage } from '../../shared/finanzRechnung.js';

// Finanzlage — die eine Rechenstelle der KI-Finanzanalyse.
// Projekte ab Tag Null, Restaufwand und Fertigstellung aus Erfahrungswerten, Einnahmen der nächsten
// 13 Wochen nach sicher/wahrscheinlich/fraglich, Kasse, Kapazität je Person, Warnungen, Datenqualität.
// Nur für den Geschäftsführer. Liest nur; einzige Schreibstelle ist der wöchentliche Zwischenspeicher
// der Erfahrungswerte (Einstellung finanz_kalibrierung).
//
// Aufruf: {} für alles, oder {"bereich": "projekte,einnahmen"} für ausgewählte Blöcke
// (stand, summen und methodik kommen immer mit).
const INHABER = 'a.rittler@rittler.co';
const BLOECKE = ['projekte', 'warnungen', 'einnahmen', 'ueberfaellig_je_kunde', 'kasse', 'kapazitaet', 'datenqualitaet'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole.entities;
    let darf = String(user.email || '').toLowerCase() === INHABER;
    if (!darf) {
      const m = await db.TeamMember.filter({ email: user.email }, 'name', 1).catch(() => []);
      darf = m[0]?.active !== false && m[0]?.system_role === 'gf';
    }
    if (!darf) return Response.json({ error: 'Nur für die Geschäftsführung' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const lage = await berechneFinanzLage(db);

    const gewuenscht = String(body?.bereich || '').split(',').map((s) => s.trim()).filter((s) => BLOECKE.includes(s));
    if (!gewuenscht.length) return Response.json(lage);
    const out = { stand: lage.stand, summen: lage.summen, methodik: lage.methodik };
    for (const b of gewuenscht) out[b] = lage[b];
    return Response.json(out);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
