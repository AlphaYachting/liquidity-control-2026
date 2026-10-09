import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Anwesenheit (Kommen, Pause, Gehen) — der Browser zeigt nur an und meldet Knopfdrücke.
// Wahr ist immer der Server (Funktionen arbeitszeitStatus und stempeln); hier wird nichts
// in localStorage gespeichert, damit ein geschlossener oder tagelang offener Browser nie
// einen falschen Stand zeigt.
//
// - Ob die neue Erfassung für diese Person überhaupt aktiv sein kann, entscheiden die
//   Settings arbeitszeit_pilot und arbeitszeit_neu_ab. Sonst wird der Server nie gefragt.
// - Stand: beim Öffnen, bei Rückkehr ins Fenster und alle 60 s, solange das Fenster sichtbar ist.
// - Jeder Knopfdruck trägt eine Vorgangsnummer und den angezeigten Zustand. Eine Wiederholung
//   nach Netzfehler verwendet dieselbe Nummer — der Server stempelt nur einmal.
// - Andere offene Fenster derselben Person werden über BroadcastChannel nachgezogen.

const SCHALTER_KEY = ['arbeitszeitSchalter'];
export const ANWESENHEIT_KEY = (email) => ['anwesenheit', email];

const zwei = (n) => String(n).padStart(2, '0');
const heuteWien = () => {
  const t = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).forEach((p) => { t[p.type] = p.value; });
  return `${t.year}-${t.month}-${t.day}`;
};

function useSchalter() {
  return useQuery({
    queryKey: SCHALTER_KEY,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const rows = await base44.entities.Setting
        .filter({ key: { $in: ['arbeitszeit_pilot', 'arbeitszeit_neu_ab'] } }, 'key', 5)
        .catch(() => []);
      const wert = (k) => String(rows.find((r) => r.key === k)?.value || '');
      const neuAb = wert('arbeitszeit_neu_ab').slice(0, 10);
      return {
        pilot: wert('arbeitszeit_pilot').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean),
        neuAb: /^\d{4}-\d{2}-\d{2}$/.test(neuAb) ? neuAb : null,
      };
    },
  });
}

// Gilt die Anwesenheitserfassung für diese Person heute? (Pilot oder ab Stichtag)
// Für „Meine Zeiten“ — dieselbe kleine, lang zwischengespeicherte Abfrage der Settings wie der Knopf.
export function useArbeitszeitAktiv(email) {
  const { data: schalter } = useSchalter();
  const mail = String(email || '').toLowerCase();
  return !!mail && !!schalter
    && (schalter.pilot.includes(mail) || (!!schalter.neuAb && heuteWien() >= schalter.neuAb));
}

const neueVorgangsnummer = () => {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
};

// Antwortdaten aus Erfolg oder Fehler der Funktion holen (409 trägt den aktuellen Stand mit)
const datenAus = (res, fehler) => (fehler ? fehler?.response?.data : res?.data) || null;

const NAECHSTER = { kommen: 'da', pause_start: 'pause', pause_ende: 'da', gehen: 'weg' };

// Sofort gezeigter Stand nach einem Knopfdruck — nur Anzeige, bis die Serverantwort da ist.
function sofortStand(vorher, art, jetzt) {
  const iso = jetzt.toISOString();
  const h = vorher.heute || {};
  const lief = vorher.zustand === 'da'
    ? Math.max(0, Math.floor((jetzt.getTime() - Date.parse(vorher.jetzt)) / 60000)) : 0;
  return {
    ...vorher,
    zustand: NAECHSTER[art],
    seit: iso,
    jetzt: iso,
    gehenUnklar: art === 'kommen' ? false : vorher.gehenUnklar,
    timer: art === 'pause_start' || art === 'gehen' ? null : vorher.timer,
    heute: {
      ...h,
      kommen: h.kommen || (art === 'kommen' ? iso : null),
      arbeitszeitMin: (h.arbeitszeitMin || 0) + lief,
      bloecke: art === 'kommen' ? [...(h.bloecke || []), { von: iso, bis: iso }] : h.bloecke,
    },
  };
}

export function useAnwesenheit(email) {
  const qc = useQueryClient();
  const { data: schalter } = useSchalter();
  const mail = String(email || '').toLowerCase();
  const moeglich = !!mail && !!schalter
    && (schalter.pilot.includes(mail) || (!!schalter.neuAb && heuteWien() >= schalter.neuAb));

  const versatz = useRef(0); // Serverzeit − Browserzeit in ms
  const { data: stand, isLoading } = useQuery({
    queryKey: ANWESENHEIT_KEY(mail),
    enabled: moeglich,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // läuft nur, solange das Fenster sichtbar ist
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const gesendet = Date.now();
      // Über dieselbe Funktion wie der Knopfdruck — so bleibt sie warm und der Klick wartet nie auf einen Kaltstart.
      const res = await base44.functions.invoke('stempeln', { nur_stand: true });
      const daten = res?.data || {};
      if (daten.fehler) throw new Error(daten.fehler);
      if (daten.jetzt) versatz.current = Date.parse(daten.jetzt) - Math.round((gesendet + Date.now()) / 2);
      return daten;
    },
  });

  // Andere Fenster derselben Person nachziehen
  const kanal = useRef(null);
  useEffect(() => {
    if (!moeglich || typeof BroadcastChannel === 'undefined') return undefined;
    const k = new BroadcastChannel('anwesenheit');
    k.onmessage = (e) => {
      if (e.data !== mail) return;
      qc.invalidateQueries({ queryKey: ANWESENHEIT_KEY(mail) });
      qc.invalidateQueries({ queryKey: ['anwesenheitWoche'], refetchType: 'active' });
    };
    kanal.current = k;
    return () => { k.close(); kanal.current = null; };
  }, [moeglich, mail, qc]);

  // Nach Rückkehr aus dem Ruhezustand oder über Mitternacht sofort neu fragen
  useEffect(() => {
    if (!moeglich) return undefined;
    const sichtbar = () => {
      if (document.visibilityState === 'visible') qc.invalidateQueries({ queryKey: ANWESENHEIT_KEY(mail) });
    };
    document.addEventListener('visibilitychange', sichtbar);
    return () => document.removeEventListener('visibilitychange', sichtbar);
  }, [moeglich, mail, qc]);

  const [laeuft, setLaeuft] = useState(null); // Art des Knopfdrucks, der gerade gesendet wird
  const [fehlgeschlagen, setFehlgeschlagen] = useState(null); // { art, vorgang_id, notiz } für „Erneut versuchen“

  // Knopfdruck: Die Anzeige springt SOFORT auf den neuen Zustand (optimistisch); die Antwort des
  // Servers ersetzt sie danach durch den echten Stand. Scheitert die Verbindung, kehrt die Anzeige
  // zum alten Stand zurück und „Erneut senden“ erscheint.
  const stempeln = useCallback(async (art, { notiz = '', vorgangId } = {}) => {
    const key = ANWESENHEIT_KEY(mail);
    const vorgang_id = vorgangId || neueVorgangsnummer();
    const vorher = qc.getQueryData(key);
    const erwartet = vorher?.zustand;
    setLaeuft(art);
    setFehlgeschlagen(null);
    // Laufende Abfrage abbrechen, damit sie den sofort gezeigten Zustand nicht überschreibt
    qc.cancelQueries({ queryKey: key });
    if (vorher && NAECHSTER[art]) qc.setQueryData(key, sofortStand(vorher, art, new Date(Date.now() + versatz.current)));
    // Pause und Gehen stoppen einen Timer von heute — die Pille verschwindet sofort mit
    const timerKey = ['laufendeZeitbuchung', email];
    const timerVorher = qc.getQueryData(timerKey);
    const timerStopptMit = (art === 'pause_start' || art === 'gehen') && !!vorher?.timer && !!timerVorher;
    if (timerStopptMit) qc.setQueryData(timerKey, null);

    let daten = null;
    let netzfehler = false;
    try {
      const res = await base44.functions.invoke('stempeln', { art, vorgang_id, erwartet, notiz });
      daten = datenAus(res);
    } catch (e) {
      daten = datenAus(null, e);
      netzfehler = !daten;
    }
    setLaeuft(null);
    if (netzfehler) {
      // Nichts ist sicher — mit DERSELBEN Vorgangsnummer erneut senden, der Server stempelt nur einmal.
      if (vorher) qc.setQueryData(key, vorher);
      if (timerStopptMit) qc.setQueryData(timerKey, timerVorher);
      setFehlgeschlagen({ art, vorgang_id, notiz });
      return { fehler: 'netz' };
    }
    if (daten && daten.aktiv !== undefined) {
      if (daten.jetzt) versatz.current = Date.parse(daten.jetzt) - Date.now();
      qc.setQueryData(key, daten);
    } else {
      if (vorher) qc.setQueryData(key, vorher);
      qc.invalidateQueries({ queryKey: key });
    }
    // Nicht gestempelt (veraltet, Fehler) oder kein Timer gebucht: Pille wieder vom Server holen
    if (timerStopptMit && !daten?.gebucht) qc.invalidateQueries({ queryKey: timerKey });
    try { kanal.current?.postMessage(mail); } catch { /* egal */ }
    // „Meine Zeiten“ zeigt Kommen/Pause/Gehen — dort nachziehen, falls die Seite offen ist
    qc.invalidateQueries({ queryKey: ['anwesenheitWoche'], refetchType: 'active' });
    if (daten?.gebucht) {
      // Ein mitgestoppter Timer: Pille sofort leeren, Zeiten und Mein Tag beim nächsten Aufruf neu
      try { localStorage.removeItem('sprint_timer_cache'); } catch { /* egal */ }
      qc.setQueryData(['laufendeZeitbuchung', email], null);
      qc.invalidateQueries({ queryKey: ['zeitenSeite'], refetchType: 'active' });
      qc.invalidateQueries({ queryKey: ['sprintHeute'], refetchType: 'active' });
    }
    return daten || {};
  }, [qc, mail, email]);

  const erneut = useCallback(() => {
    if (!fehlgeschlagen) return null;
    return stempeln(fehlgeschlagen.art, { notiz: fehlgeschlagen.notiz, vorgangId: fehlgeschlagen.vorgang_id });
  }, [fehlgeschlagen, stempeln]);

  // Jetzt in Serverzeit — für die laufende Anzeige
  const jetzt = useCallback(() => new Date(Date.now() + versatz.current), []);

  return {
    sichtbar: moeglich && !!stand?.aktiv && !!stand?.stempelt,
    stand,
    isLoading,
    laeuft,
    fehlgeschlagen,
    stempeln,
    erneut,
    jetzt,
  };
}

export const uhrzeit = (iso) => {
  if (!iso) return '';
  const t = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).forEach((p) => { t[p.type] = p.value; });
  return `${t.hour}:${t.minute}`;
};

export const dauer = (min) => {
  const m = Math.max(0, Math.round(Number(min) || 0));
  return `${Math.floor(m / 60)}:${zwei(m % 60)} h`;
};
