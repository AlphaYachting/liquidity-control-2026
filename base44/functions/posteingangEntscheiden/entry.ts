import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Entscheidungen im Posteingang (Entscheidung Alfons 06.10.2026, Variante B):
// Posteingangs-Einträge legt das System an — ändern dürfen sie laut Datenregel nur Ersteller und Admins.
// Wer den Posteingang oder den Support-Eingang sieht, soll dort aber auch entscheiden können.
// Diese Funktion prüft das Recht der Person und schreibt den Eintrag dann.
//
// Eingabe: { item_id, patch }
// Rechte (wie useZugriff „leitung“ / „support“): Admin, Führung (Stufe gf), Projektleitung (Stufe pm),
// Fachrolle Web — oder wer den Eintrag selbst angelegt hat.
// Erlaubt sind nur die Felder einer Entscheidung bzw. einer Korrektur der KI-Einschätzung.

const ok = (d) => Response.json(d);
const fehler = (text, status = 400) => Response.json({ error: text }, { status });

const ENUMS: Record<string, string[]> = {
  status: ['new', 'converted', 'dismissed'],
  decision: ['offen', 'lead', 'zugeordnet', 'nur_antwort', 'verworfen'],
  suggested_action: ['supportticket', 'anfrage', 'kein_lead'],
};
const TEXTFELDER = ['linked_ticket_id', 'linked_deal_id', 'dismiss_reason'];
const BOOLFELDER = ['is_known_customer'];

function bereinige(patch: any) {
  const sauber: Record<string, unknown> = {};
  if (!patch || typeof patch !== 'object') return sauber;
  for (const [k, werte] of Object.entries(ENUMS)) {
    if (k in patch) {
      if (!werte.includes(patch[k])) throw new Error(`Ungültiger Wert für ${k}`);
      sauber[k] = patch[k];
    }
  }
  for (const k of TEXTFELDER) if (k in patch) sauber[k] = String(patch[k] ?? '').slice(0, 2000);
  for (const k of BOOLFELDER) if (k in patch) sauber[k] = !!patch[k];
  return sauber;
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fehler('Unauthorized', 401);

    const { item_id: itemId, patch } = await req.json().catch(() => ({}));
    if (!itemId) return fehler('item_id fehlt');

    let sauber: Record<string, unknown>;
    try { sauber = bereinige(patch); } catch (e) { return fehler((e as Error).message); }
    if (Object.keys(sauber).length === 0) return fehler('Keine Änderung angegeben');

    const db = base44.asServiceRole.entities;
    const item = await db.CrmInboxItem.get(itemId).catch(() => null);
    if (!item) return fehler('Eintrag nicht gefunden', 404);

    const istAdmin = user.role === 'admin';
    const istErsteller = !!item.created_by_id && item.created_by_id === user.id;
    let darf = istAdmin || istErsteller;
    if (!darf) {
      const person = (await db.TeamMember.filter({ email: user.email }, 'name', 1))[0];
      const aktiv = person && person.active !== false;
      const rollen: string[] = person?.roles || [];
      darf = !!aktiv && (person.system_role === 'gf' || person.system_role === 'pm' || rollen.includes('Web'));
    }
    if (!darf) return fehler('Dafür fehlt dir die Berechtigung — Posteingang-Entscheidungen treffen Führung, Projektleitung und Web.', 403);

    // Eine Entscheidung gilt einmal: Ist der Eintrag schon übernommen, nicht ein zweites Mal verknüpfen
    const entscheidung = sauber.status && sauber.status !== 'new';
    if (entscheidung && item.status !== 'new') {
      return fehler(item.linked_ticket_id
        ? 'Dieser Eintrag wurde bereits in ein Ticket übernommen.'
        : 'Dieser Eintrag wurde bereits entschieden.', 409);
    }
    if (entscheidung) {
      sauber.decided_by = user.email || '';
      sauber.decided_at = new Date().toISOString();
    }

    const neu = await db.CrmInboxItem.update(itemId, sauber);
    return ok({ item: { ...item, ...sauber, ...(neu || {}) } });
  } catch (e) {
    return fehler((e as Error)?.message || 'Unbekannter Fehler', 500);
  }
}