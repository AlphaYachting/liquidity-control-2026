// Zuweisung von Post an eine Person (Entscheidung Alfons 12.10.2026):
//  - zuweisen darf jeder mit Zugang zum Posteingang, an jede Person im Team
//  - die Zuständigkeit gilt je Konversation und endet mit der Antwort (die Konversation ist dann nicht
//    mehr unbeantwortet); schreibt der Kunde wieder, ist dieselbe Person wieder zuständig
//  - nach einem Arbeitstag ohne Reaktion weist das Backend automatisch zu (syncEmailThreadIndex)
//  - zugewiesene Post erscheint in „Mein Tag“ der Person
// Eine Eskalation wird über ihre Mail zugewiesen — CrmEscalation.assigned_to wird mitgeführt.
import { base44 } from '@/api/base44Client';

export const ZUWEISUNG_KEY = ['post-zuweisungen'];

// Schlüssel der Konversation eines Posteingangs-Eintrags
export function schluesselVon(eintrag) {
  if (eintrag?.thread?.conversation_key) return eintrag.thread.conversation_key;
  if (eintrag?.threadId) return `#${eintrag.threadId}`;
  return eintrag?.item?.id ? `item:${eintrag.item.id}` : '';
}

// Zuweisung eines Eintrags aus der geladenen Liste finden (über Konversation oder Verlauf)
export function zuweisungFuer(eintrag, zuweisungen = []) {
  const s = schluesselVon(eintrag);
  const tid = eintrag?.threadId ? String(eintrag.threadId) : '';
  return zuweisungen.find((z) => z.schluessel === s) || (tid && zuweisungen.find((z) => String(z.thread_id) === tid)) || null;
}

async function eskalationMitfuehren(threadId, an) {
  if (!threadId) return;
  const faelle = await base44.entities.CrmEscalation.filter({ thread_id: String(threadId) }, '-created_at', 5).catch(() => []);
  await Promise.all(faelle.map((f) => base44.entities.CrmEscalation.update(f.id, { assigned_to: an || '' })));
}

/**
 * Zuweisen oder aufheben (an = '' hebt auf).
 *  eintrag — Posteingangs-Eintrag, oder { threadId, thread: { conversation_key }, betreff }
 */
export async function zuweisen({ eintrag, an, vorhandene = null }) {
  const user = await base44.auth.me().catch(() => null);
  const schluessel = schluesselVon(eintrag);
  if (!schluessel) throw new Error('Diese Nachricht lässt sich nicht zuordnen.');
  const bestehend = vorhandene
    || (await base44.entities.PostZuweisung.filter({ schluessel }, '-zugewiesen_am', 1))[0]
    || (eintrag.threadId ? (await base44.entities.PostZuweisung.filter({ thread_id: String(eintrag.threadId) }, '-zugewiesen_am', 1))[0] : null);

  if (!an) {
    if (bestehend) await base44.entities.PostZuweisung.delete(bestehend.id);
  } else {
    const daten = {
      schluessel,
      thread_id: eintrag.threadId ? String(eintrag.threadId) : '',
      betreff: eintrag.betreff || eintrag.thread?.subject || '',
      zugewiesen_an: an,
      zugewiesen_von: user?.email || '',
      zugewiesen_am: new Date().toISOString(),
      quelle: 'manuell',
    };
    if (bestehend) await base44.entities.PostZuweisung.update(bestehend.id, daten);
    else await base44.entities.PostZuweisung.create(daten);
  }
  await eskalationMitfuehren(eintrag.threadId, an);
}

// Zuweisung aus der Eskalationsliste: dort ist nur die Verlaufs-ID bekannt
export async function zuweisenVerlauf({ threadId, betreff, an }) {
  const zeile = (await base44.entities.EmailThreadIndex.filter({ thread_id: String(threadId) }, '-indexed_at', 1).catch(() => []))[0];
  return zuweisen({ eintrag: { threadId: String(threadId), thread: zeile || null, betreff }, an });
}
