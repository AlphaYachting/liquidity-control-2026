import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Einmalige Vorbefüllung des Vertragsmodells aus den awork-Daten.
// Manuell gesetzte Werte werden nie überschrieben.
function ableiten(snapshot) {
  if (!snapshot) return 'unbekannt';
  const roh = `${snapshot.raw_payload || ''} ${snapshot.custom_fields_json || ''}`.toLowerCase();
  const typ = (snapshot.project_type || '').toLowerCase();
  const status = (snapshot.project_status || '').toLowerCase();
  const name = (snapshot.name || '').toLowerCase();

  if (typ.includes('pauschal') || roh.includes('"pauschal"') || roh.includes('pauschal')) return 'pauschal';
  if (roh.includes('"isretainer":true') || roh.includes('"is_retainer":true') || status.includes('dauerprojekt')) return 'retainer';
  if (name.includes('stundenkontingent') || name.includes('rahmenvertrag') || name.includes('stundenpaket')) return 'stundenkontingent';
  return 'unbekannt';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const projekte = await base44.asServiceRole.entities.LiquidityProject.list('-created_date', 2000);
    const snapshots = await base44.asServiceRole.entities.AworkProjectSnapshot.list('-created_date', 3000);
    const nachId = new Map(snapshots.map(s => [s.awork_project_id, s]));

    const zaehler = { pauschal: 0, stundenkontingent: 0, retainer: 0, unbekannt: 0, uebersprungen: 0 };
    const updates = [];

    for (const p of projekte) {
      if (p.abrechnungsmodell && p.abrechnungsmodell !== 'unbekannt') { zaehler.uebersprungen++; continue; }
      const modell = ableiten(p.awork_project_id ? nachId.get(p.awork_project_id) : null)
        || 'unbekannt';
      const ausName = (() => {
        const n = (p.project_name || '').toLowerCase();
        if (n.includes('stundenkontingent') || n.includes('rahmenvertrag') || n.includes('stundenpaket')) return 'stundenkontingent';
        return null;
      })();
      const wert = modell !== 'unbekannt' ? modell : (ausName || 'unbekannt');
      zaehler[wert]++;
      if (wert !== 'unbekannt' || !p.abrechnungsmodell) updates.push({ id: p.id, abrechnungsmodell: wert });
    }

    for (let i = 0; i < updates.length; i += 200) {
      await base44.asServiceRole.entities.LiquidityProject.bulkUpdate(updates.slice(i, i + 200));
    }

    return Response.json({ geprueft: projekte.length, geschrieben: updates.length, zaehler });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}