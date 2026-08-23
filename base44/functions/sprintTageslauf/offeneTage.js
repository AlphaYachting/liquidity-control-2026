// SCHRITT 10 — Morgens eine Erinnerung an jede Person mit offenen Tagen.
// Keine Meldung an Vorgesetzte: die Buchungssperre wirkt bereits.

const RUECKBLICK = 14;

const dauerText = (min) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
};

const fmt = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

// Vergangene Werktage vor heute, ältester zuerst
function vergangeneWerktage(today) {
  const out = [];
  for (let i = RUECKBLICK; i >= 1; i -= 1) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const wt = d.getUTCDay();
    if (wt >= 1 && wt <= 5) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function schritt10(ctx) {
  const sr = ctx.base44.asServiceRole.entities;
  const [members, abschluesse, eintraege, focusDays] = await Promise.all([
    sr.TeamMember.filter({ active: true }, 'name', 200),
    sr.Tagesabschluss.list('-tag', 3000),
    sr.TimeEntry.list('-entry_date', 5000),
    sr.FocusDay.list('-day', 2000),
  ]);

  const tage = vergangeneWerktage(ctx.today);
  let n = 0;

  for (const member of members) {
    const abwesend = focusDays.filter((f) => f.person_email === member.email && f.type === 'abwesend');
    const offen = tage
      .filter((t) => !abwesend.some((f) => f.day <= t && (f.until || f.day) >= t))
      .filter((t) => !abschluesse.some((a) => a.person_email === member.email && a.tag === t && a.bestaetigt_am))
      .map((t) => ({
        tag: t,
        gebucht: eintraege
          .filter((e) => e.person_email === member.email && e.entry_date === t)
          .reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0),
      }));

    if (!offen.length) continue;

    const zeilen = offen
      .map((o) => `• ${fmt(o.tag)} — ${o.gebucht > 0 ? `${dauerText(o.gebucht)} erfasst, noch nicht abgeschlossen` : 'nichts erfasst'}`)
      .join('\n');

    await ctx.base44.asServiceRole.integrations.Core.SendEmail({
      to: member.email,
      from_name: 'Rittler & Co.',
      subject: `${offen.length} offene${offen.length === 1 ? 'r' : ''} Arbeitstag${offen.length === 1 ? '' : 'e'}`,
      body: `Hallo ${member.name},\n\nfolgende Tage sind noch nicht abgeschlossen:\n\n${zeilen}\n\nSolange ein Tag offen ist, wird keine neue Zeit gebucht — der Timer läuft aber weiter.\n\nZeiten öffnen: ${ctx.appUrl || ''}/zeiten`,
    }).catch((e) => ctx.errors.push(`Erinnerung offene Tage an ${member.email} fehlgeschlagen: ${e.message}`));
    n += 1;
  }

  return { processed: n, detail: `${tage.length} Werktage geprüft` };
}