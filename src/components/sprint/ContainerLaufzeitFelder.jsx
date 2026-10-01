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
