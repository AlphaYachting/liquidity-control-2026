// Zeitanträge — Prüfen, Stellen, Entscheiden. Grundsatz (Alfons, 09.10.2026):
// Es gibt KEIN manuelles Eintragen. Zeit entsteht nur durch Knopfdruck (Kommen/Pause/Gehen,
// Timer Start/Stopp). Jede Änderung daran ist ein Antrag und wirkt erst nach Genehmigung.
// Projektzeit lässt sich nicht nachtragen; ändern lassen sich nur gemessene Buchungen.
// Einzige Ausnahme: ein fehlender Stempel (Kommen/Gehen vergessen) — ebenfalls nur per Antrag.
// `db` = base44.asServiceRole.entities
import { wienTag, spieleAb, bloeckeUndPausen, darfGenehmigen, modusFuer } from './arbeitszeitKern.js';
import { ladeStempel, ladeBuchungen, nachweisNeu, ladeEinstellungen } from './arbeitszeitDaten.js';
import { timerVerbuchen, buchungsfelder, ueberKontingent } from './zeitBuchung.js';

export const GRUND_MIN = 5;
const istZeit = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const iso = (v) => new Date(v).toISOString();
const fehler = (text) => ({ fehler: text });

// ---------------------------------------------------------------------------
// Reine Prüfungen

// Stempel des Tages, wie sie NACH dem Antrag aussähen
export function stempelNachAntrag(stempel, antrag) {
  const gueltig = stempel.filter((s) => (s.status || 'gueltig') === 'gueltig');
  const n = antrag.nachher || {};
  if (antrag.art === 'aendern') return gueltig.map((s) => (s.id === antrag.ziel_id ? { ...s, zeit: iso(n.zeit) } : s));
  if (antrag.art === 'loeschen') return gueltig.filter((s) => s.id !== antrag.ziel_id);
  if (antrag.art === 'nachtragen') return [...gueltig, { id: '__neu', art: n.art, zeit: iso(n.zeit), status: 'gueltig', created_date: '9999' }];
  if (antrag.art === 'gehen_angeben') {
    const ohneAuto = gueltig.filter((s) => s.id !== antrag._autoGehenId);
    return [...ohneAuto, { id: '__neu', art: 'gehen', zeit: iso(n.zeit), status: 'gueltig', created_date: '9999' }];
  }
  return gueltig;
}

export function pruefeStempelAntrag({ stempel, antrag, jetztIso }) {
  const n = antrag.nachher || {};
  if (['aendern', 'nachtragen', 'gehen_angeben'].includes(antrag.art)) {
    if (!istZeit(n.zeit)) return 'Uhrzeit fehlt';
    if (iso(n.zeit) > jetztIso) return 'Eine Zeit in der Zukunft ist nicht möglich';
    if (wienTag(n.zeit) !== antrag.tag) return 'Die Zeit muss am selben Tag liegen';
  }
  if (antrag.art === 'nachtragen' && !['kommen', 'pause_start', 'pause_ende', 'gehen'].includes(n.art)) return 'Art des Stempels fehlt';
  if (['aendern', 'loeschen'].includes(antrag.art)) {
    const s = stempel.find((x) => x.id === antrag.ziel_id);
    if (!s || (s.status || 'gueltig') !== 'gueltig') return 'Dieser Stempel gilt nicht mehr';
  }
  const nachher = stempelNachAntrag(stempel, antrag);
  const { konflikte } = spieleAb(nachher);
  if (konflikte.length) return 'Danach würde die Reihenfolge nicht mehr stimmen (z. B. Gehen vor Kommen, zwei Mal Kommen)';
  return null;
}

// Anwesenheitsblöcke abzüglich Pausen — nur abgeschlossene Blöcke zählen
function anwesenheitsFenster(stempel) {
  const { wirksam } = spieleAb(stempel);
  const { bloecke, pausen } = bloeckeUndPausen(wirksam, null);
  return { bloecke: bloecke.filter((b) => !b.offen && b.bis), pausen: pausen.filter((p) => p.bis) };
}

export function pruefeBuchungAntrag({ buchung, buchungen = [], stempel = [], antrag, jetztIso, stempelt = true }) {
  const n = antrag.nachher || {};
  if (antrag.art === 'loeschen') {
    if (!buchung) return 'Diese Buchung gibt es nicht mehr';
    if (buchung.abrechnungsstatus === 'abgerechnet') return 'Bereits abgerechnet — nicht mehr änderbar';
    return null;
  }
  const von = antrag.art === 'ende_angeben' ? n.von : n.started_at;
  const bis = antrag.art === 'ende_angeben' ? n.bis : n.ended_at;
  if (!istZeit(von) || !istZeit(bis)) return 'Beginn und Ende fehlen';
  if (iso(bis) <= iso(von)) return 'Das Ende muss nach dem Beginn liegen';
  if (iso(bis) > jetztIso) return 'Eine Zeit in der Zukunft ist nicht möglich';
  if (wienTag(von) !== antrag.tag || wienTag(new Date(Date.parse(bis) - 1)) !== antrag.tag) return 'Beginn und Ende müssen am selben Tag liegen';
  if (antrag.art === 'aendern') {
    if (!buchung) return 'Diese Buchung gibt es nicht mehr';
    if (buchung.abrechnungsstatus === 'abgerechnet') return 'Bereits abgerechnet — nicht mehr änderbar';
  }
  if (antrag.art === 'ende_angeben') {
    const grenze = antrag.vorher?.automatisch_angehalten_am;
    if (iso(von) !== iso(antrag.vorher?.gestartet_am || von)) return 'Der gemessene Beginn bleibt unverändert';
    if (grenze && iso(bis) > iso(grenze)) return 'Das Ende kann nicht nach dem automatischen Anhalten liegen';
  }
  // Keine Überschneidung mit anderen Buchungen der Person
  const ueber = buchungen.find((b) => b.id !== buchung?.id && b.started_at && b.ended_at
    && iso(b.started_at) < iso(bis) && iso(b.ended_at) > iso(von));
  if (ueber) return 'Überschneidet sich mit einer anderen Buchung';
  // Projektzeit nur innerhalb der Anwesenheit und nie in einer Pause
  if (stempelt) {
    const { bloecke, pausen } = anwesenheitsFenster(stempel);
    const drin = bloecke.some((b) => iso(b.von) <= iso(von) && iso(b.bis) >= iso(bis));
    if (!drin) return 'Liegt nicht innerhalb von Kommen und Gehen';
    if (pausen.some((p) => iso(p.von) < iso(bis) && iso(p.bis) > iso(von))) return 'Überschneidet sich mit einer Pause';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stellen (durch die Person selbst)

// Eingabe: { antrag_id? (Entwurf ausfüllen), ziel, art, ziel_id?, tag, nachher, grund, vorgang_id }
export async function antragStellen(db, email, eingabe, jetzt = new Date(), { stempelt = true } = {}) {
  const jetztIso = jetzt.toISOString();
  const grund = String(eingabe.grund || '').trim();
  if (grund.length < GRUND_MIN) return fehler('Bitte kurz begründen');

  if (eingabe.vorgang_id) {
    const schon = await db.Zeitantrag.filter({ person_email: email, vorgang_id: eingabe.vorgang_id }, 'created_date', 1);
    if (schon[0]) return { antrag: schon[0], wiederholt: true };
  }

  let antrag;
  if (eingabe.antrag_id) {
    // Entwurf der Automatik ausfüllen (Gehen angeben, Timer-Ende angeben)
    const e = await db.Zeitantrag.get(eingabe.antrag_id).catch(() => null);
    if (!e || e.person_email !== email) return fehler('Antrag nicht gefunden');
    if (e.status !== 'entwurf') return fehler('Dieser Antrag ist schon gestellt');
    antrag = { ...e, nachher: { ...(e.nachher || {}), ...(eingabe.nachher || {}) }, grund };
  } else {
    if (!['stempel', 'buchung'].includes(eingabe.ziel)) return fehler('Ziel fehlt');
    const erlaubt = eingabe.ziel === 'stempel' ? ['aendern', 'loeschen', 'nachtragen'] : ['aendern', 'loeschen'];
    if (!erlaubt.includes(eingabe.art)) return fehler('Diese Änderung ist nicht vorgesehen');
    antrag = { person_email: email, ziel: eingabe.ziel, art: eingabe.art, ziel_id: eingabe.ziel_id || null, tag: eingabe.tag, nachher: eingabe.nachher || {}, grund };
  }

  // Ein offener Antrag je Ziel — sonst widersprechen sich zwei Genehmigungen
  if (antrag.ziel_id) {
    const offen = await db.Zeitantrag.filter({ person_email: email, ziel_id: antrag.ziel_id, status: 'offen' }, 'created_date', 1);
    if (offen[0]) return fehler('Dazu ist schon ein Antrag offen');
  }

  const pruef = await pruefen(db, email, antrag, jetztIso, stempelt);
  if (pruef.fehler) return pruef;
  const daten = { ...antrag, vorher: { ...(antrag.vorher || {}), ...pruef.vorher }, status: 'offen', ...(eingabe.vorgang_id ? { vorgang_id: eingabe.vorgang_id } : {}) };
  delete daten._autoGehenId;
  if (eingabe.antrag_id) {
    const { id, created_date, updated_date, created_by, created_by_id, is_sample, ...rest } = daten;
    return { antrag: await db.Zeitantrag.update(eingabe.antrag_id, rest) };
  }
  return { antrag: await db.Zeitantrag.create(daten) };
}

// Gemeinsame Prüfung für Stellen und Entscheiden — immer gegen den AKTUELLEN Stand.
async function pruefen(db, email, antrag, jetztIso, stempelt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(antrag.tag || ''))) return fehler('Tag fehlt');
  const [stempel, buchungen] = await Promise.all([ladeStempel(db, email, antrag.tag), ladeBuchungen(db, email, antrag.tag)]);
  if (antrag.ziel === 'stempel') {
    if (antrag.art === 'gehen_angeben') {
      const kommenId = String(antrag.vorgang_id || '').replace(/^gehen:/, '');
      const auto = stempel.find((s) => s.vorgang_id === `auto:${kommenId}` && (s.status || 'gueltig') === 'gueltig');
      if (!auto) return fehler('Das automatische Gehen ist schon geklärt');
      antrag._autoGehenId = auto.id;
      const grenze = antrag.vorher?.automatisch_beendet_am;
      if (grenze && istZeit(antrag.nachher?.zeit) && iso(antrag.nachher.zeit) > iso(grenze)) return fehler('Gehen kann nicht nach dem automatischen Beenden liegen');
    }
    const f = pruefeStempelAntrag({ stempel, antrag, jetztIso });
    if (f) return fehler(f);
    const ziel = stempel.find((s) => s.id === antrag.ziel_id);
    return { vorher: ziel ? { art: ziel.art, zeit: ziel.zeit, quelle: ziel.quelle } : {}, stempel, buchungen };
  }
  const buchung = antrag.ziel_id ? buchungen.find((b) => b.id === antrag.ziel_id) || null : null;
  if (buchung && buchung.person_email !== email) return fehler('Fremde Buchung');
  const f = pruefeBuchungAntrag({ buchung, buchungen, stempel, antrag, jetztIso, stempelt });
  if (f) return fehler(f);
  return {
    vorher: buchung ? { started_at: buchung.started_at, ended_at: buchung.ended_at, duration_minutes: buchung.duration_minutes, project_id: buchung.project_id, note: buchung.note || '' } : {},
    stempel, buchungen, buchung,
  };
}

export async function antragZurueckziehen(db, email, antragId) {
  const a = await db.Zeitantrag.get(antragId).catch(() => null);
  if (!a || a.person_email !== email) return fehler('Antrag nicht gefunden');
  if (a.status !== 'offen') return fehler('Nur offene Anträge lassen sich zurückziehen');
  return { antrag: await db.Zeitantrag.update(antragId, { status: 'zurueckgezogen' }) };
}

// ---------------------------------------------------------------------------
// Entscheiden (nur Genehmiger)

const minuten = (von, bis) => Math.max(0, Math.round((Date.parse(bis) - Date.parse(von)) / 60000));

async function protokoll(db, wer, aktion, entity, id, alt, neu, antragId) {
  await db.AuditLog.create({
    action: aktion, entity_type: entity, entity_id: id, user_email: wer,
    details: `Zeitantrag ${antragId} genehmigt`,
    old_value: alt ? JSON.stringify(alt) : undefined,
    new_value: neu ? JSON.stringify(neu) : undefined,
  }).catch(() => null);
}

async function anwenden(db, antrag, wer, jetztIso, stempelt) {
  const email = antrag.person_email;
  const pruef = await pruefen(db, email, { ...antrag }, jetztIso, stempelt);
  if (pruef.fehler) return pruef;
  const n = antrag.nachher || {};
  const ids = [];

  if (antrag.ziel === 'stempel') {
    const basis = { person_email: email, tag: antrag.tag, quelle: 'antrag', status: 'gueltig', antrag_id: antrag.id, erfasst_von: wer };
    if (antrag.art === 'nachtragen') {
      const s = await db.Stempel.create({ ...basis, art: n.art, zeit: iso(n.zeit) });
      ids.push(s.id);
    } else if (antrag.art === 'aendern') {
      const alt = pruef.stempel.find((s) => s.id === antrag.ziel_id);
      const s = await db.Stempel.create({ ...basis, art: alt.art, zeit: iso(n.zeit) });
      await db.Stempel.update(alt.id, { status: 'storniert', ersetzt_durch: s.id, status_grund: `Zeitantrag ${antrag.id}` });
      ids.push(s.id, alt.id);
    } else if (antrag.art === 'loeschen') {
      await db.Stempel.update(antrag.ziel_id, { status: 'storniert', status_grund: `Zeitantrag ${antrag.id}` });
      ids.push(antrag.ziel_id);
    } else if (antrag.art === 'gehen_angeben') {
      const auto = pruef.stempel.find((s) => s.id === antrag._autoGehenId);
      const s = await db.Stempel.create({ ...basis, art: 'gehen', zeit: iso(n.zeit) });
      await db.Stempel.update(auto.id, { status: 'storniert', ersetzt_durch: s.id, status_grund: `Gehen angegeben, Zeitantrag ${antrag.id}` });
      ids.push(s.id, auto.id);
    }
  } else if (antrag.art === 'loeschen') {
    const alt = pruef.buchung;
    await db.TimeEntry.delete(alt.id);
    await protokoll(db, wer, 'delete', 'TimeEntry', alt.id, alt, null, antrag.id);
    ids.push(alt.id);
  } else if (antrag.art === 'aendern') {
    const alt = pruef.buchung;
    const min = minuten(n.started_at, n.ended_at);
    const { project } = await buchungsfelder(db, alt.project_id);
    const ueber = await ueberKontingent(db, project, alt.entry_date, min, alt.id);
    const neu = {
      started_at: iso(n.started_at), ended_at: iso(n.ended_at), duration_minutes: min,
      hours: Math.round((min / 60) * 100) / 100, ueber_kontingent: ueber, source: 'korrigiert',
    };
    await db.TimeEntry.update(alt.id, neu);
    await protokoll(db, wer, 'update', 'TimeEntry', alt.id, alt, neu, antrag.id);
    ids.push(alt.id);
  } else if (antrag.art === 'ende_angeben') {
    // Wie ein gestoppter Timer buchen — gleiche Felder, gleiche Wiederholbarkeit (laufende_id)
    const laufende = {
      id: antrag.vorher?.laufende_id || `antrag:${antrag.id}`, person_email: email, project_id: n.project_id,
      ticket_id: n.ticket_id || null, module_template_id: n.module_template_id || null,
      gestartet_am: iso(n.von), notiz: n.note || '',
    };
    const r = await timerVerbuchen(db, laufende, { endeIso: iso(n.bis), tag: antrag.tag, laufendeBehalten: true });
    await db.TimeEntry.update(r.eintrag.id, { source: 'korrigiert' }).catch(() => null);
    ids.push(r.eintrag.id);
  }
  return { ids };
}

// Eingabe: { ids: [...], entscheidung: 'genehmigt'|'abgelehnt', kommentar }
// Stempel-Anträge zuerst, damit z. B. ein angegebenes Gehen gilt, bevor das Timer-Ende geprüft wird.
export async function antraegeEntscheiden(db, wer, { ids = [], entscheidung, kommentar = '' }, jetzt = new Date()) {
  const einst = await ladeEinstellungen(db);
  if (!darfGenehmigen(wer, einst)) return fehler('Keine Berechtigung');
  if (!['genehmigt', 'abgelehnt'].includes(entscheidung)) return fehler('Entscheidung fehlt');
  if (entscheidung === 'abgelehnt' && String(kommentar).trim().length < 3) return fehler('Bitte bei Ablehnung kurz begründen');
  const jetztIso = jetzt.toISOString();
  const antraege = (await Promise.all(ids.map((id) => db.Zeitantrag.get(id).catch(() => null)))).filter(Boolean)
    .sort((a, b) => (a.ziel === 'stempel' ? 0 : 1) - (b.ziel === 'stempel' ? 0 : 1) || String(a.tag).localeCompare(String(b.tag)));
  const ergebnis = [];
  const betroffen = new Set();
  for (const a of antraege) {
    if (a.status !== 'offen') { ergebnis.push({ id: a.id, status: a.status, unveraendert: true }); continue; }
    if (entscheidung === 'abgelehnt') {
      await db.Zeitantrag.update(a.id, { status: 'abgelehnt', entschieden_von: wer, entschieden_am: jetztIso, kommentar });
      ergebnis.push({ id: a.id, status: 'abgelehnt' });
      continue;
    }
    const stempelt = modusFuer(a.person_email, a.tag, einst).stempelt;
    const r = await anwenden(db, a, wer, jetztIso, stempelt);
    if (r.fehler) { ergebnis.push({ id: a.id, fehler: r.fehler }); continue; }
    await db.Zeitantrag.update(a.id, { status: 'genehmigt', entschieden_von: wer, entschieden_am: jetztIso, kommentar, angewendet_ids: r.ids });
    betroffen.add(`${a.person_email}|${a.tag}`);
    ergebnis.push({ id: a.id, status: 'genehmigt' });
  }
  // Tagesnachweise der betroffenen Tage neu rechnen — auch festgeschriebene
  await Promise.all([...betroffen].map((k) => {
    const [email, tag] = k.split('|');
    return nachweisNeu(db, email, tag, einst, { auchFest: true }).catch(() => null);
  }));
  return { ergebnis };
}
