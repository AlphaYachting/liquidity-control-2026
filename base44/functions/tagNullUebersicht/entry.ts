import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { berechneTagNull } from '../../shared/tagNullRechnung.js';

// Tag-Null-Sicht (nur Admin) — Projektübersicht ab dem Sanierungsstichtag.
// Die Rechnung selbst liegt in base44/shared/tagNullRechnung.js und wird auch von finanzLage
// (KI-Finanzanalyse, Wochenbericht) verwendet — eine Formel, kein zweiter Rechenweg.
// Schreibt nichts.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Nur für Admins' }, { status: 403 });

    const t = await berechneTagNull(base44.asServiceRole.entities);
    if (t.leer) return Response.json({ tag_null: t.tag_null, projekte: {}, summen: null });

    return Response.json({
      tag_null: t.tag_null, umstellung: t.umstellung, stundensatz: t.stundensatz,
      ohne_auftrag: t.ohne_auftrag,
      summen: t.summen,
      projekte: t.projekte,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
