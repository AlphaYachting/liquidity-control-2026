// Vertrauliche Post — EINE Regel für alle Stellen, an denen die App E-Mails zeigt
// (Entscheidung Alfons 05.10.2026). Gleichlautend in base44/shared/vertraulich.js für die Server-Funktionen — bei Änderungen BEIDE anpassen.
//
//  1. Masseverwalter (Liste „Ausblenden“, z. B. unseranwalt.at): Absender ODER Empfänger ODER in Kopie
//     -> für ALLE unsichtbar, auch für den Geschäftsführer.
//  2. Verwaltung (Liste „Verwaltung“: Steuerberatung, Bank, Lieferanten, Behörden) -> nur Admins sehen sie.
//  3. Mails nur an den Geschäftsführer (kein anderer Kollege, kein Sammelpostfach beteiligt)
//     -> nur Admins sehen sie. Ist ein Kollege oder office@/support@ dabei, bleibt sie für die Kollegen sichtbar.

export const INHABER_EMAIL = 'a.rittler@rittler.co';
const EIGENE_DOMAIN = '@rittler.co';
const ADRESSE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g;

// Alle Adressen aus beliebigen Feldern (Strings, Arrays, „Name <a@b.at> · Cc: c@d.at“)
export function adressen(...werte) {
  const out = new Set();
  const nimm = (v) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(nimm); return; }
    if (typeof v === 'object') { nimm(v.email || v.address || ''); return; }
    (String(v).toLowerCase().match(ADRESSE) || []).forEach((a) => out.add(a));
  };
  werte.forEach(nimm);
  return [...out];
}

// Trifft eine Regel (ganze Adresse oder Domain) auf eine Adresse?
export function trifftRegel(adresse, regeln = []) {
  const a = String(adresse || '').trim().toLowerCase();
  if (!a) return false;
  return regeln.some((r) => {
    if (r.is_active === false) return false;
    const v = String(r.value || '').trim().toLowerCase();
    if (!v) return false;
    if (v.includes('@') && !v.startsWith('@')) return a === v;
    const domain = v.startsWith('@') ? v.slice(1) : v;
    return a.endsWith('@' + domain);
  });
}

export function teileRegeln(regeln = []) {
  const aktiv = regeln.filter((r) => r.is_active !== false);
  return {
    ausblenden: aktiv.filter((r) => (r.mode || 'ausblenden') === 'ausblenden'),
    verwaltung: aktiv.filter((r) => r.mode === 'verwaltung'),
  };
}

/**
 * Prüft eine Mail bzw. Konversation.
 *  absender   — alle Absender (Liste oder Felder), empfaenger — alle Empfänger/Kopie (soweit bekannt)
 *  regeln     — InboxBlockedSender-Zeilen, istAdmin — Betrachter ist Admin
 * Rückgabe: null (zeigen) oder Grund: 'masseverwalter' | 'verwaltung' | 'geschaeftsfuehrer'
 */
export function vertraulichGrund({ absender = [], empfaenger = [], regeln = [], istAdmin = false }) {
  const { ausblenden, verwaltung } = teileRegeln(regeln);
  const von = adressen(absender);
  const an = adressen(empfaenger);
  const alle = [...new Set([...von, ...an])];
  if (alle.some((a) => trifftRegel(a, ausblenden))) return 'masseverwalter';
  if (istAdmin) return null;
  if (von.some((a) => trifftRegel(a, verwaltung))) return 'verwaltung';
  const gf = INHABER_EMAIL;
  if (alle.includes(gf) && !alle.some((a) => a !== gf && a.endsWith(EIGENE_DOMAIN))) return 'geschaeftsfuehrer';
  return null;
}

// Empfänger aus den Kopfzeilen einer weitergeleiteten/zitierten Nachricht („An:“, „To:“, „Cc:“)
export function kopfEmpfaenger(text) {
  const zeilen = String(text || '').split('\n').slice(0, 40);
  return zeilen.filter((z) => /^\s*(an|to|cc|kopie|von|from)\s*:/i.test(z)).join(' ');
}

// Teilnehmer einer Konversation aus den Nachrichten der E-Mail-DB
export function teilnehmerAusNachrichten(messages = []) {
  const absender = [];
  const empfaenger = [];
  for (const m of messages || []) {
    absender.push(m.from);
    empfaenger.push(m.to, m.cc, m.bcc, kopfEmpfaenger(m.text || m.body || m.snippet));
  }
  return { absender, empfaenger };
}
