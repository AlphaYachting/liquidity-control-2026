import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Einzige Stelle, an der Projektaufgaben aus der Datenquelle gelesen werden.
// Heute awork (AworkTaskSnapshot), später die Entity Ticket — die Oberfläche
// arbeitet ausschließlich mit den hier vergebenen Feldnamen.

const LEER = {
  gesamt: 0, erledigt: 0, offen: 0, blockiert: 0,
  erledigt_prozent: 0, budget_verbraucht_prozent: null,
  geplante_minuten: 0, gebuchte_minuten: 0,
  naechste_frist: null, ueberfaellig_anzahl: 0,
  letzte_aktivitaet: null, zuletzt_synchronisiert: null,
  daten_veraltet: false,
};

function mapAworkTask(t) {
  return {
    id: t.id,
    titel: t.task_title || '',
    bearbeiter: t.assignee_name || '',
    faellig_am: t.due_date || null,
    status_text: t.task_status_name || '',
    ist_blockiert: t.is_blocked === true || t.task_status_type === 'blocked',
    ist_erledigt: t.is_done === true || t.task_status_type === 'done',
    liste: t.task_list_name || '',
    letzte_aktivitaet: t.last_activity_at || null,
    geplante_minuten: Number(t.planned_duration_minutes) || 0,
    gebuchte_minuten: Number(t.tracked_duration_minutes) || 0,
    herkunft: 'aufgabe',
  };
}

// Zweite Quelle: offene Zusagen aus dem digitalen Kundenakt — verbindlicher als eine Aufgabe.
function mapZusage(e) {
  return {
    id: e.id,
    titel: e.follow_up_text || e.title || 'Zusage',
    bearbeiter: 'zugesagt',
    faellig_am: e.follow_up_date || null,
    status_text: 'Zusage',
    ist_blockiert: false,
    ist_erledigt: false,
    liste: '',
    letzte_aktivitaet: e.entry_date || null,
    geplante_minuten: 0,
    gebuchte_minuten: 0,
    herkunft: 'zusage',
  };
}

function berechneKennzahlen(alle, rohdaten) {
  const heute = new Date().toISOString().slice(0, 10);
  const offene = alle.filter(a => !a.ist_erledigt);
  const erledigt = alle.length - offene.length;

  const geplant = alle.reduce((s, a) => s + a.geplante_minuten, 0);
  const gebucht = alle.reduce((s, a) => s + a.gebuchte_minuten, 0);

  let naechste_frist = null;
  let ueberfaellig_anzahl = 0;
  offene.forEach(a => {
    if (!a.faellig_am) return;
    if (!naechste_frist || a.faellig_am < naechste_frist) naechste_frist = a.faellig_am;
    if (a.faellig_am < heute) ueberfaellig_anzahl += 1;
  });

  let letzte_aktivitaet = null;
  alle.forEach(a => {
    if (a.letzte_aktivitaet && (!letzte_aktivitaet || a.letzte_aktivitaet > letzte_aktivitaet)) {
      letzte_aktivitaet = a.letzte_aktivitaet;
    }
  });

  let zuletzt_synchronisiert = null;
  rohdaten.forEach(t => {
    if (t.last_synced_at && (!zuletzt_synchronisiert || t.last_synced_at > zuletzt_synchronisiert)) {
      zuletzt_synchronisiert = t.last_synced_at;
    }
  });

  return {
    gesamt: alle.length,
    erledigt,
    offen: offene.length,
    blockiert: offene.filter(a => a.ist_blockiert).length,
    erledigt_prozent: alle.length > 0 ? Math.round((erledigt / alle.length) * 100) : 0,
    budget_verbraucht_prozent: geplant > 0 ? Math.round((gebucht / geplant) * 100) : null,
    geplante_minuten: geplant,
    gebuchte_minuten: gebucht,
    naechste_frist,
    ueberfaellig_anzahl,
    letzte_aktivitaet,
    zuletzt_synchronisiert,
    daten_veraltet: zuletzt_synchronisiert
      ? (Date.now() - new Date(zuletzt_synchronisiert).getTime()) > 24 * 3600 * 1000
      : false,
  };
}

export default function useProjektAufgaben({ projectId, aworkProjectId }) {
  const { data: rohdaten = [], isLoading, isError } = useQuery({
    queryKey: ['projektAufgaben', aworkProjectId || null],
    queryFn: () => base44.entities.AworkTaskSnapshot.filter({ awork_project_id: aworkProjectId }),
    enabled: !!aworkProjectId,
  });

  const { data: zusagenRoh = [] } = useQuery({
    queryKey: ['projektZusagen', projectId || null],
    queryFn: () => base44.entities.ProjectFileEntry.filter({ project_id: projectId, follow_up_done: false }),
    enabled: !!projectId,
  });

  return useMemo(() => {
    const zusagen = zusagenRoh.filter(e => !!e.follow_up_date).map(mapZusage);
    if (!aworkProjectId) {
      return {
        aufgaben: zusagen,
        kennzahlen: berechneKennzahlen(zusagen, []),
        quelle: 'intern',
        isLoading: false,
        isError: false,
      };
    }
    const alle = [...rohdaten.map(mapAworkTask), ...zusagen];
    return {
      aufgaben: alle.filter(a => !a.ist_erledigt),
      kennzahlen: berechneKennzahlen(alle, rohdaten),
      quelle: 'awork',
      isLoading,
      isError,
    };
  }, [aworkProjectId, projectId, rohdaten, zusagenRoh, isLoading, isError]);
}