import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { fmtDate } from '@/components/sprint/sprintConfig';

const STICHTAG_STANDARD = '2026-10-04';

// Laufzeit-Felder für Retainer (Container) — direkt unter „Kontingent-Stunden pro Monat".
// Inline, kein Pop-up. Wird aus ProjectTypeFields für type === 'container' gerendert.
export default function ContainerLaufzeitFelder({ form, setForm, project, abVorschlag, user }) {
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const [stichtag, setStichtag] = useState(STICHTAG_STANDARD);

  // Stichtag aus Setting laden
  useEffect(() => {
    base44.entities.Setting.filter({ key: 'awork_umstellung_stichtag' }, 'key', 1)
      .then((rows) => {
        const wert = String(rows[0]?.value || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(wert)) setStichtag(wert);
      })
      .catch(() => {});
  }, []);

  // Laufzeitbeginn mit AB-Vorschlag vorbelegen, wenn das Feld am Projekt leer ist
  useEffect(() => {
    if (!form.laufzeit_beginn && abVorschlag?.beginn) {
      set('laufzeit_beginn')(abVorschlag.beginn);
      set('laufzeit_beginn_quelle')('ab');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abVorschlag]);

  // Hinweis: neue Periode, wenn der Beginn nach vorne verschoben wird
  const alteBeginn = project?.laufzeit_beginn ? String(project.laufzeit_beginn).slice(0, 10) : null;
  const neueBeginn = form.laufzeit_beginn ? String(form.laufzeit_beginn).slice(0, 10) : null;
  const showNeuePeriode = alteBeginn && neueBeginn && neueBeginn > alteBeginn;

  const showAltstand = neueBeginn && neueBeginn <= stichtag;

  // Kontingentverlauf: frühere, belegte Monatskontingente (von/bis als YYYY-MM)
  const verlauf = Array.isArray(form.kontingent_verlauf) ? form.kontingent_verlauf : [];
  const setVerlauf = (neu) => setForm((f) => ({ ...f, kontingent_verlauf: neu }));
  const aendereZeile = (i, k, v) => setVerlauf(verlauf.map((z, j) => (j === i ? { ...z, [k]: v } : z)));

  return (
    <>
      <div>
        <Label>Laufzeitbeginn</Label>
        <Input
          type="date"
          value={form.laufzeit_beginn || ''}
          onChange={(e) => set('laufzeit_beginn')(e.target.value)}
        />
        {abVorschlag?.ab_nummer && (!form.laufzeit_beginn || form.laufzeit_beginn === abVorschlag.beginn) && (
          <p className="mt-1 text-xs text-muted-foreground">aus AB {abVorschlag.ab_nummer}</p>
        )}
      </div>

      {showNeuePeriode && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Neue Periode ab {fmtDate(neueBeginn)}. Die bisherige Periode wird abgeschlossen und bleibt sichtbar. Übertrag wird auf 0 gesetzt, außer du trägst einen anderen ein.
        </p>
      )}

      <div>
        <Label>Übertrag in Stunden</Label>
        <Input
          type="number"
          value={form.kontingent_uebertrag_stunden ?? ''}
          onChange={(e) => set('kontingent_uebertrag_stunden')(e.target.value)}
          placeholder="0"
        />
        <p className="mt-1 text-xs text-muted-foreground">Anfangsstand der Periode — normalerweise 0</p>
      </div>

      <div>
        <Label>Frühere Monatskontingente</Label>
        <p className="mt-0.5 mb-1.5 text-xs text-muted-foreground">
          Nur eintragen, wenn sich das Kontingent geändert hat — und nur mit Beleg (AB, Vertrag). Monate außerhalb gelten mit dem Kontingent oben.
        </p>
        {verlauf.map((z, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <Input className="w-[130px]" type="month" value={z.von || ''} onChange={(e) => aendereZeile(i, 'von', e.target.value)} aria-label="von Monat" />
            <span className="text-xs text-muted-foreground">bis</span>
            <Input className="w-[130px]" type="month" value={z.bis || ''} onChange={(e) => aendereZeile(i, 'bis', e.target.value)} aria-label="bis Monat" />
            <Input className="w-[80px]" type="number" step="0.25" value={z.stunden ?? ''} onChange={(e) => aendereZeile(i, 'stunden', e.target.value)} placeholder="h" aria-label="Stunden pro Monat" />
            <Input className="flex-1 min-w-[140px]" value={z.beleg || ''} onChange={(e) => aendereZeile(i, 'beleg', e.target.value)} placeholder="Beleg, z. B. AB-Nummer" aria-label="Beleg" />
            <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setVerlauf(verlauf.filter((_, j) => j !== i))}>entfernen</button>
          </div>
        ))}
        <button
          type="button"
          className="text-xs underline text-muted-foreground"
          onClick={() => setVerlauf([...verlauf, { von: '', bis: '', stunden: '', beleg: '' }])}
        >
          + Zeitraum mit anderem Kontingent
        </button>
      </div>

      {showAltstand && (
        <div>
          <Label>Verbraucht bis {fmtDate(stichtag)} laut aWork (Stunden)</Label>
          <Input
            type="number"
            step="0.01"
            value={form.awork_altstand_stunden ?? ''}
            onChange={(e) => set('awork_altstand_stunden')(e.target.value)}
            placeholder="0"
          />
          <p className="mt-1 text-xs text-muted-foreground">Manuell aus aWork übertragen — Stunden ab Laufzeitbeginn bis zum Stichtag</p>
        </div>
      )}
    </>
  );
}
