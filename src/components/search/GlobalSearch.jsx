import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useUserScope } from '@/lib/useUserScope';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { suche as sucheImIndex } from '@/lib/searchRank';
import { ladeIndex, merkeGeoeffnet, zuletztGeoeffnet } from '@/lib/searchIndex';
import TrefferFlaeche from './TrefferFlaeche';

export default function GlobalSearch() {
  const { user } = useAuth();
  const { workAreas, seesAll } = useUserScope();
  const navigate = useNavigate();
  const feld = useRef(null);
  const abbruch = useRef(null);
  const lebt = useRef(true);
  const blurTimer = useRef(null);
  const [zeilen, setZeilen] = useState([]);
  const [eingabe, setEingabe] = useState('');
  const [aktiv, setAktiv] = useState(false);
  const [markiert, setMarkiert] = useState(0);
  const [offen, setOffen] = useState({});
  const [tief, setTief] = useState([]);
  const [tiefLaeuft, setTiefLaeuft] = useState(false);
  const [zuletzt, setZuletzt] = useState([]);

  // Beim Verlassen dürfen keine Nachläufer mehr in die Anzeige schreiben.
  useEffect(() => {
    lebt.current = true;
    return () => {
      lebt.current = false;
      clearTimeout(blurTimer.current);
      abbruch.current?.abort();
    };
  }, []);

  // Index einmal laden: vorhandener Stand sofort, Auffrischung im Hintergrund.
  useEffect(() => {
    if (!user?.email) return;
    let gilt = true;
    const setzen = (z) => { if (gilt && lebt.current) setZeilen(Array.isArray(z) ? z : []); };
    ladeIndex(user.email, setzen).then(setzen).catch(() => setzen([]));
    setZuletzt(zuletztGeoeffnet());
    return () => { gilt = false; };
  }, [user?.email]);

  // ⌘K / Strg+K öffnet und markiert den Inhalt.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        feld.current?.focus();
        feld.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { gruppen } = useMemo(() => sucheImIndex(zeilen, eingabe), [zeilen, eingabe]);

  const alleGruppen = useMemo(() => {
    if (!tief.length) return gruppen;
    const post = gruppen.find((g) => g.key === 'post');
    if (post) {
      return gruppen.map((g) => (g.key === 'post' ? { ...g, alle: [...g.alle, ...tief] } : g));
    }
    return [...gruppen, { key: 'post', titel: 'Post & Akte', max: 3, alle: tief }];
  }, [gruppen, tief]);

  // Eine flache Liste über alle Gruppen — die Pfeiltasten kennen keine Grenzen.
  const flach = useMemo(() => {
    if (!eingabe) return zuletzt.map((z) => ({ ...z, __key: `zuletzt:${z.route}` }));
    const liste = [];
    alleGruppen.forEach((g) => {
      const sichtbar = offen[g.key] ? g.alle : g.alle.slice(0, g.max);
      sichtbar.forEach((z) => liste.push({ ...z, __key: `${g.key}:${z.id || z.route}` }));
    });
    return liste;
  }, [alleGruppen, offen, eingabe, zuletzt]);

  // Zweite Stufe: 300 ms nach dem letzten Anschlag, laufende Abfrage abbrechen.
  useEffect(() => {
    setTief([]);
    if (!eingabe || !(seesAll || workAreas.includes('sales'))) return;
    abbruch.current?.abort();
    const controller = new AbortController();
    abbruch.current = controller;
    const t = setTimeout(async () => {
      setTiefLaeuft(true);
      try {
        const res = await base44.functions.invoke('searchDeep', { q: eingabe });
        if (!controller.signal.aborted) setTief(res.data?.treffer || []);
      } catch (e) {
        /* die obere Liste bleibt stehen */
      }
      if (!controller.signal.aborted) setTiefLaeuft(false);
    }, 300);
    return () => { clearTimeout(t); controller.abort(); setTiefLaeuft(false); };
  }, [eingabe, seesAll, workAreas]);

  const oeffnen = (zeile) => {
    merkeGeoeffnet(zeile);
    setZuletzt(zuletztGeoeffnet());
    setAktiv(false);
    setEingabe('');
    feld.current?.blur();
    navigate(zeile.route);
  };

  const tasten = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMarkiert((m) => (flach.length ? (m + 1) % flach.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMarkiert((m) => (flach.length ? (m - 1 + flach.length) % flach.length : 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const ziel = flach[markiert];
      if (ziel) oeffnen(ziel);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (eingabe) { setEingabe(''); setMarkiert(0); return; }
      setAktiv(false);
      feld.current?.blur();
    }
  };

  return (
    <div className="relative w-full max-w-[560px]">
      <div
        className="flex items-center gap-2 px-3"
        style={{
          height: 38,
          borderRadius: 3,
          border: `1px solid ${aktiv ? '#2d2d2d' : RITTLER.line}`,
          backgroundColor: aktiv ? '#ffffff' : RITTLER.surface,
        }}
      >
        <Search className="w-4 h-4 shrink-0" style={{ color: aktiv ? RITTLER.pink : RITTLER.textSecondary }} />
        <input
          ref={feld}
          value={eingabe}
          onChange={(e) => { setEingabe(e.target.value); setMarkiert(0); setOffen({}); }}
          onFocus={() => setAktiv(true)}
          onBlur={() => {
            clearTimeout(blurTimer.current);
            blurTimer.current = setTimeout(() => { if (lebt.current) setAktiv(false); }, 120);
          }}
          onKeyDown={tasten}
          placeholder="Kunde, Projekt, Beleg, Ticket …"
          className="flex-1 bg-transparent outline-none text-[13.5px]"
        />
        <span className="text-[10.5px] shrink-0" style={{ color: RITTLER.textSecondary }}>⌘K</span>
      </div>

      {aktiv && (
        <TrefferFlaeche
          eingabe={eingabe}
          gruppen={alleGruppen}
          flach={flach}
          markiert={markiert}
          setMarkiert={setMarkiert}
          offen={offen}
          aufklappen={(key) => setOffen((o) => ({ ...o, [key]: true }))}
          tiefLaeuft={tiefLaeuft}
          anzahlImSpeicher={zeilen.length}
          zuletzt={zuletzt}
          onOeffnen={oeffnen}
        />
      )}
    </div>
  );
}