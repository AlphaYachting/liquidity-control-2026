// SCHRITT 8 — Zeitvorschläge aus den Spuren des Tages.
// Es wird nie gebucht: jeder Vorschlag ist eine Erinnerungshilfe.

const FENSTER = 120;       // Ereignisse im Abstand bis zwei Stunden bilden einen Vorschlag
const MIN_MINUTEN = 30;    // Mindestdauer eines Vorschlags
const MIN_REST = 15;       // kürzere freie Reste werden nicht vorgeschlagen
const TAG_VON = 8 * 60;
const TAG_BIS = 20 * 60;

const tagVon = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

const minuteVon = (iso) => {
  const s = new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' });
  return Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
};

const versatzMinuten = (day) => {
  const s = new Date(`${day}T12:00:00Z`).toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' });
  return (Number(s.slice(11, 13)) - 12) * 60;
};

const isoAusMinute = (day, minute) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + (minute - versatzMinuten(day)) * 60000).toISOString();

const uhr = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

// Freie Abschnitte des Tages — schon gebuchte Zeit wird nie doppelt vorgeschlagen.
function freieAbschnitte(belegt) {
  const sortiert = [...belegt].sort((a, b) => a.von - b.von);
  const frei = [];
  let cursor = TAG_VON;
  for (const b of sortiert) {
    if (b.von > cursor) frei.push({ von: cursor, bis: Math.min(b.von, TAG_BIS) });
    cursor = Math.max(cursor, b.bis);
  }
  if (cursor < TAG_BIS) frei.push({ von: cursor, bis: TAG_BIS });
  return frei.filter((f) => f.bis - f.von >= MIN_REST);
}

// Größter freier Teil eines gewünschten Fensters
function passeAn(kandidat, frei) {
  let best = null;
  for (const f of frei) {
    const von = Math.max(kandidat.von, f.von);
    const bis = Math.min(kandidat.bis, f.bis);
    if (bis - von >= MIN_REST && (!best || bis - von > best.bis - best.von)) best = { von, bis };
  }
  return best;
}

function gruppiere(ereignisse) {
  const sortiert = [...ereignisse].sort((a, b) => a.min - b.min);
  const gruppen = [];
  let cur = null;
  for (const e of sortiert) {
    if (cur && e.min - cur.von <= FENSTER) {
      cur.bis = e.min;
      cur.zeiten.push(e.min);
    } else {
      if (cur) gruppen.push(cur);
      cur = { von: e.min, bis: e.min, zeiten: [e.min], projectId: e.projectId, ticketId: e.ticketId, titel: e.titel };
    }
  }
  if (cur) gruppen.push(cur);
  return gruppen;
}

const zeitenText = (zeiten) => {
  const l = zeiten.map(uhr);
  if (l.length === 1) return l[0];
  return `${l.slice(0, -1).join(', ')} und ${l[l.length - 1]}`;
};

export async function schritt8(ctx) {
  const sr = ctx.base44.asServiceRole.entities;
  const [members, users, settings, tickets, comments, approvals, focusDays, timeEntries, bestehende] = await Promise.all([
    sr.TeamMember.filter({ active: true }, 'name', 200),
    sr.User.list('-created_date', 500).catch(() => []),
    sr.Setting.filter({ key: 'standard_day_hours' }, 'key', 1).catch(() => []),
    sr.Ticket.list('-created_date', 5000),
    sr.Comment.list('-created_date', 5000),
    sr.Approval.list('-approved_at', 2000),
    sr.FocusDay.list('-day', 1000),
    sr.TimeEntry.list('-entry_date', 5000),
    sr.Zeitvorschlag.list('-day', 2000),
  ]);

  const normMinuten = (Number(settings[0]?.value) || 8) * 60;
  const emailById = Object.fromEntries(users.map((u) => [u.id, u.email]));

  // die letzten drei Tage
  const tage = [1, 2, 3].map((zurueck) => {
    const d = new Date(`${ctx.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - zurueck + 1);
    return d.toISOString().slice(0, 10);
  });

  let n = 0;
  const detail = [];

  for (const member of members) {
    const email = member.email;
    for (const day of tage) {
      const gebucht = timeEntries
        .filter((e) => e.person_email === email && e.entry_date === day && e.started_at && e.ended_at)
        .map((e) => ({ von: minuteVon(e.started_at), bis: minuteVon(e.ended_at) }));
      const gebuchtMinuten = timeEntries
        .filter((e) => e.person_email === email && e.entry_date === day)
        .reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);

      const vorhanden = bestehende.filter((v) => v.person_email === email && v.day === day);
      const belegt = [
        ...gebucht,
        ...vorhanden.map((v) => ({ von: minuteVon(v.von), bis: minuteVon(v.bis) })),
      ];
      let frei = freieAbschnitte(belegt);
      if (!frei.length) continue;

      const kandidaten = [];

      // a) Aufgaben, die an diesem Tag auf erledigt gesetzt wurden
      const erledigt = tickets
        .filter((t) => t.assignee_email === email && t.status === 'erledigt'
          && t.last_status_change && tagVon(t.last_status_change) === day && t.project_id)
        .map((t) => ({ min: minuteVon(t.last_status_change), projectId: t.project_id, ticketId: t.id, titel: t.title }));
      const nachProjekt = {};
      erledigt.forEach((e) => { (nachProjekt[e.projectId] = nachProjekt[e.projectId] || []).push(e); });
      for (const [projectId, liste] of Object.entries(nachProjekt)) {
        for (const g of gruppiere(liste)) {
          kandidaten.push({
            projectId,
            ticketId: liste.length === 1 ? g.ticketId : '',
            von: g.von,
            bis: g.bis,
            beleg: `${g.zeiten.length === 1 ? 'Eine Aufgabe' : `${g.zeiten.length} Aufgaben`} um ${zeitenText(g.zeiten)} auf erledigt gesetzt.`,
            notiz: g.titel || '',
          });
        }
      }

      // b) Kommentare dieser Person, gruppiert nach Ticket bzw. Projekt
      const eigene = comments
        .filter((c) => c.author_email === email && tagVon(c.created_date) === day && c.project_id)
        .map((c) => ({ min: minuteVon(c.created_date), projectId: c.project_id, ticketId: c.ticket_id || '' }));
      const nachStrang = {};
      eigene.forEach((c) => {
        const key = `${c.projectId}|${c.ticketId}`;
        (nachStrang[key] = nachStrang[key] || []).push(c);
      });
      for (const liste of Object.values(nachStrang)) {
        for (const g of gruppiere(liste)) {
          const ort = g.ticketId ? 'in der Aufgabe' : 'im Projekt';
          kandidaten.push({
            projectId: g.projectId,
            ticketId: g.ticketId,
            von: g.von,
            bis: g.bis,
            beleg: `${g.zeiten.length === 1 ? 'Ein Kommentar' : `${g.zeiten.length} Kommentare`} ${ort} zwischen ${uhr(g.von)} und ${uhr(g.bis)}.`,
            notiz: '',
          });
        }
      }

      // c) Freigaben dieser Person
      const freigaben = approvals
        .filter((a) => a.approved_at && tagVon(a.approved_at) === day && a.project_id
          && emailById[a.created_by_id] === email)
        .map((a) => ({ min: minuteVon(a.approved_at), projectId: a.project_id, ticketId: '' }));
      const freigabenNachProjekt = {};
      freigaben.forEach((a) => { (freigabenNachProjekt[a.projectId] = freigabenNachProjekt[a.projectId] || []).push(a); });
      for (const liste of Object.values(freigabenNachProjekt)) {
        for (const g of gruppiere(liste)) {
          kandidaten.push({
            projectId: g.projectId,
            ticketId: '',
            von: g.von,
            bis: g.bis,
            beleg: `${g.zeiten.length === 1 ? 'Eine Freigabe' : `${g.zeiten.length} Freigaben`} um ${zeitenText(g.zeiten)} erteilt.`,
            notiz: 'Freigabe',
          });
        }
      }

      let vorgeschlagenMinuten = 0;

      for (const k of kandidaten) {
        const gewuenscht = { von: k.von, bis: Math.max(k.bis, k.von + MIN_MINUTEN) };
        const passend = passeAn(gewuenscht, frei);
        if (!passend) continue;
        await sr.Zeitvorschlag.create({
          person_email: email,
          day,
          von: isoAusMinute(day, passend.von),
          bis: isoAusMinute(day, passend.bis),
          project_id: k.projectId,
          ticket_id: k.ticketId || undefined,
          beleg: k.beleg,
          vorgeschlagene_notiz: k.notiz || undefined,
          status: 'offen',
        });
        belegt.push(passend);
        frei = freieAbschnitte(belegt);
        vorgeschlagenMinuten += passend.bis - passend.von;
        n += 1;
      }

      // d) Focus-Tag füllt die verbleibende Zeit bis zur Tagesnorm
      const focus = focusDays.find((f) => f.person_email === email && f.day === day && f.type === 'focus' && f.project_id);
      const rest = normMinuten - gebuchtMinuten - vorgeschlagenMinuten;
      if (focus && rest >= MIN_MINUTEN && frei.length) {
        const groesste = frei.reduce((a, b) => (b.bis - b.von > a.bis - a.von ? b : a));
        const bis = Math.min(groesste.bis, groesste.von + rest);
        if (bis - groesste.von >= MIN_MINUTEN) {
          await sr.Zeitvorschlag.create({
            person_email: email,
            day,
            von: isoAusMinute(day, groesste.von),
            bis: isoAusMinute(day, bis),
            project_id: focus.project_id,
            beleg: 'Für diesen Tag als Focus-Tag geplant.',
            status: 'offen',
          });
          n += 1;
        }
      }

      if (n > 0) detail.push(`${email} ${day}`);
    }
  }

  return { processed: n, detail: detail.slice(0, 10).join(', ') };
}