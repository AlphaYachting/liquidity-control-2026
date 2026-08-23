// SCHRITT 9 — Freitagserinnerung an unbestätigte Tage der laufenden Woche.

const NORM = 480;

// Montag bis heute (Freitag) im lokalen Kalender
function wochentageBis(today) {
  const d = new Date(`${today}T12:00:00Z`);
  const versatz = (d.getUTCDay() + 6) % 7;
  return Array.from({ length: versatz + 1 }, (_, i) => {
    const t = new Date(`${today}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() - versatz + i);
    return t.toISOString().slice(0, 10);
  });
}

const dauerText = (min) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
};

const fmt = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

export async function schritt9(ctx) {
  const istFreitag = new Date(`${ctx.today}T12:00:00Z`).getUTCDay() === 5;
  if (!istFreitag) return { processed: 0, detail: 'nur freitags' };

  const sr = ctx.base44.asServiceRole.entities;
  const tage = wochentageBis(ctx.today);
  const [members, abschluesse, eintraege] = await Promise.all([
    sr.TeamMember.filter({ active: true }, 'name', 200),
    sr.Tagesabschluss.list('-tag', 2000),
    sr.TimeEntry.list('-entry_date', 5000),
  ]);

  let n = 0;
  for (const member of members) {
    const offen = tage
      .filter((t) => !abschluesse.some((a) => a.person_email === member.email && a.tag === t && a.bestaetigt_am))
      .map((t) => {
        const gebucht = eintraege
          .filter((e) => e.person_email === member.email && e.entry_date === t)
          .reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);
        return { tag: t, fehlt: Math.max(0, NORM - gebucht) };
      });

    if (!offen.length) continue;

    const zeilen = offen.map((o) => `• ${fmt(o.tag)} — ${dauerText(o.fehlt)} offen`).join('\n');
    await ctx.base44.asServiceRole.integrations.Core.SendEmail({
      to: member.email,
      from_name: 'Rittler & Co.',
      subject: 'Zeiten dieser Woche noch nicht abgeschlossen',
      body: `Hallo ${member.name},\n\nfolgende Tage dieser Woche sind noch nicht abgeschlossen:\n\n${zeilen}\n\nBitte die Zeiten ergänzen und die Tage abschließen.`,
    }).catch((e) => ctx.errors.push(`Erinnerung an ${member.email} fehlgeschlagen: ${e.message}`));
    n += 1;
  }

  return { processed: n, detail: `${tage.length} Tage geprüft` };
}