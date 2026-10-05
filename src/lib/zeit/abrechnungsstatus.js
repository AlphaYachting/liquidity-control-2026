import { base44 } from '@/api/base44Client';

// Wird eine Abrechnungsanweisung erzeugt, gelten die nach Aufwand verrechenbaren
// offenen Stunden dieses Projekts bis zum Stichtag als fakturiert.
//
// projectId ist die Projekt-Cockpit-ID (LiquidityProject.id) — so übergibt sie der
// Abrechnungs-Assistent. Zeitbuchungen tragen aber die Projekt-ID (Project.id).
// Deshalb werden zuerst alle Projekte gesucht, die mit diesem Cockpit verknüpft sind.
// (Bis 05.10.2026 wurde direkt mit der Cockpit-ID gesucht — es wurde nie eine Stunde gefunden.)
//
// Abgeschlossen wird nur, was tatsächlich nach Zeit verrechnet wird:
// - Kategorie 'aufwand' (Regie, Support nach Aufwand)
// - Kategorie 'paket' nur über dem Kontingent (Mehrleistung eines Retainers)
// Sprint- und Pauschalstunden bleiben unberührt — sie werden nicht nach Zeit fakturiert.
const wirdNachZeitVerrechnet = (e) =>
  e.kategorie === 'aufwand' || (e.kategorie === 'paket' && e.ueber_kontingent === true);

async function projektIdsZu(cockpitOderProjektId) {
  const verknuepft = await base44.entities.Project
    .filter({ liquidity_project_id: cockpitOderProjektId }, '-created_date', 50)
    .catch(() => []);
  const ids = new Set(verknuepft.map((p) => p.id));
  // Falls doch eine Projekt-ID übergeben wurde, gilt sie ebenso.
  ids.add(cockpitOderProjektId);
  return [...ids];
}

export async function schliesseZeitenAb({ projectId, instructionId, stichtag }) {
  if (!projectId || !instructionId) return 0;
  const grenze = stichtag || new Date().toISOString().slice(0, 10);
  const projektIds = await projektIdsZu(projectId);

  const offene = [];
  for (const pid of projektIds) {
    const rows = await base44.entities.TimeEntry.filter(
      { project_id: pid, abrechnungsstatus: 'offen', verrechenbar: true },
      '-entry_date',
      1000,
    ).catch(() => []);
    offene.push(...rows);
  }

  const betroffen = offene.filter((e) => String(e.entry_date || '') <= grenze && wirdNachZeitVerrechnet(e));
  if (!betroffen.length) return 0;
  // Die Anweisung ist zu diesem Zeitpunkt schon angelegt — ein Fehler beim Markieren
  // darf sie nicht blockieren, er wird nur protokolliert.
  try {
    await base44.entities.TimeEntry.bulkUpdate(betroffen.map((e) => ({
      id: e.id,
      abrechnungsstatus: 'abgerechnet',
      billing_instruction_id: instructionId,
      abgerechnet_am: new Date().toISOString(),
    })));
  } catch (err) {
    console.warn('schliesseZeitenAb: Stunden konnten nicht markiert werden', err);
    return 0;
  }
  return betroffen.length;
}
