import { artVon, LAUFEND, ART_LABEL } from '@/lib/auslastung/arbeitsart';
import { fmtH } from '@/lib/auslastung/auslastungRechnung';

export function naechsteMonate(n = 6) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
    return { key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: m.toLocaleDateString('de-AT', { month: 'short', year: '2-digit' }) };
  });
}

// Offene Reststunden je Person und Arbeitsart (aWork-Vorleistung abgezogen)
export function offenJeArt(daten) {
  const projById = Object.fromEntries(daten.projects.map((p) => [p.id, p]));
  const gebucht = {};
  daten.entries.forEach((e) => { gebucht[e.ticket_id] = (gebucht[e.ticket_id] || 0) + (e.duration_minutes || 0) / 60; });
  const out = {};
  daten.tickets.forEach((t) => {
    const p = projById[t.project_id];
    if (!p || (p.status && p.status !== 'aktiv') || !t.assignee_email) return;
    const art = artVon(p, t);
    if (!art) return;
    const vor = (t.awork_vorleistung_minuten || 0) / 60;
    const basis = t.rest_stunden != null ? t.rest_stunden : t.target_hours != null ? t.target_hours - (gebucht[t.id] || 0) : null;
    const ps = out[t.assignee_email.toLowerCase()] || (out[t.assignee_email.toLowerCase()] = {});
    const a = ps[art] || (ps[art] = { tickets: 0, rest: 0, ohne: 0 });
    a.tickets += 1;
    if (basis == null) a.ohne += 1; else a.rest += Math.max(0, basis - vor);
  });
  return out;
}

function zeitpunktText(d) {
  const tag = d.getDate();
  const teil = tag <= 10 ? 'Anfang' : tag <= 20 ? 'Mitte' : 'Ende';
  return `${teil} ${d.toLocaleDateString('de-AT', { month: 'long' })}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

export function vorschau(daten, rb, offen, { pauschal, neu }) {
  const monate = naechsteMonate();
  const namen = Object.fromEntries(daten.members.map((m) => [m.email.toLowerCase(), m]));
  const keys = [...new Set([...Object.keys(namen), ...Object.keys(offen)])];
  const summeRate = keys.reduce((s, k) => s + (rb.personen[k]?.avg.fix || 0), 0);
  const personen = keys.map((k) => {
    const avg = rb.personen[k]?.avg || {};
    const fix = offen[k]?.fix || { tickets: 0, rest: 0, ohne: 0 };
    const rueckstand = fix.rest + fix.ohne * pauschal;
    const rate = avg.fix || 0;
    const anteilNeu = summeRate ? neu * rate / summeRate : 0;
    let b = rueckstand;
    const reihe = monate.map((m) => {
      const zeile = { monat: m.label, fix: Math.min(b, rate), neu: anteilNeu };
      b -= zeile.fix;
      LAUFEND.forEach((a) => { zeile[a] = avg[a] || 0; });
      return zeile;
    });
    const gesichert = LAUFEND.reduce((s, a) => s + (avg[a] || 0), 0);
    const bis = rate > 0 && rueckstand > 0 ? new Date(Date.now() + (rueckstand / rate) * 30.4 * 864e5) : null;
    const datenMonate = rb.personen[k]?.datenMonate || 0;
    const unsicher = datenMonate < 3 || (fix.tickets > 0 && fix.ohne / fix.tickets > 0.5);
    const istWeb = (namen[k]?.roles || []).includes('Web');
    const supportAnteil = gesichert ? (avg.support || 0) / Math.max(1, Object.values(rb.personen).reduce((s, p) => s + (p.avg.support || 0), 0)) : 0;
    return {
      key: k, name: namen[k]?.name || k, istWeb, reihe, rueckstand, rate, bis, gesichert, unsicher,
      supportTickets: rb.supportNeuProMonat * supportAnteil, satz: satzFuer({ rueckstand, rate, bis, gesichert, avg }),
    };
  }).filter((p) => p.rueckstand > 0 || p.gesichert > 0 || p.rate > 0);
  return { monate, personen };
}

function satzFuer({ rueckstand, rate, bis, gesichert, avg }) {
  const quellen = LAUFEND.filter((a) => (avg[a] || 0) >= 1).map((a) => ART_LABEL[a]);
  const danach = gesichert > 0
    ? `rund ${fmtH(gesichert)} Stunden pro Monat aus ${quellen.join(', ') || 'laufender Arbeit'}`
    : 'keine laufende Arbeit';
  if (rueckstand <= 0) return `Keine offenen Fixprojekte; es bleiben ${danach}.`;
  if (!bis) return `${fmtH(rueckstand)} Stunden Fixprojekte offen, in den letzten sechs Monaten kein Abbau messbar; daneben ${danach}.`;
  return `Fixprojekte reichen bis ${zeitpunktText(bis)} (Abbau rund ${fmtH(rate)} h pro Monat); danach bleiben ${danach}.`;
}