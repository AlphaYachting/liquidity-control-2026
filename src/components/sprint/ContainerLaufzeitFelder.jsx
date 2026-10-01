import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { fmtDate } from '@/components/sprint/sprintConfig';

// Laufzeit-Felder für Retainer (Container) — direkt unter „Kontingent-Stunden pro Monat".
// Inline, kein Pop-up. Wird aus ProjectTypeFields für type === 'container' gerendert.
export default function ContainerLaufzeitFelder({ form, setForm, project, abVorschlag, user }) {
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const [aworkSearch, setAworkSearch] = useState('');
  const [aworkResults, setAworkResults] = useState([]);
  const [showAworkList, setShowAworkList] = useState(false);
  const [altstandMsg, setAltstandMsg] = useState(null);
  const [altstandLoading, setAltstandLoading] = useState(false);

  // Laufzeitbeginn mit AB-Vorschlag vorbelegen, wenn das Feld am Projekt leer ist
  useEffect(() => {
    if (!form.laufzeit_beginn && abVorschlag?.beginn) {
      set('laufzeit_beginn')(abVorschlag.beginn);
      set('laufzeit_beginn_quelle')('ab');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abVorschlag]);

  // awork_project_id aus der AB vorschlagen, falls nicht gesetzt
  useEffect(() => {
    if (!form.awork_project_id && abVorschlag?.awork_project_id) {
      set('awork_project_id')(abVorschlag.awork_project_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abVorschlag]);

  // Hinweis: neue Periode, wenn der Beginn nach vorne verschoben wird
  const alteBeginn = project?.laufzeit_beginn ? String(project.laufzeit_beginn).slice(0, 10) : null;
  const neueBeginn = form.laufzeit_beginn ? String(form.laufzeit_beginn).slice(0, 10) : null;
  const showNeuePeriode = alteBeginn && neueBeginn && neueBeginn > alteBeginn;

  const searchAwork = async (query) => {
    setAworkSearch(query);
    if (query.length < 2) { setAworkResults([]); return; }
    try {
      const all = await base44.entities.AworkProjectSnapshot.list('-last_synced_at', 200);
      setAworkResults(
        all
          .filter(
            (p) =>
              !p.is_archived &&
              (p.name?.toLowerCase().includes(query.toLowerCase()) ||
                p.company_name?.toLowerCase().includes(query.toLowerCase())),
          )
          .slice(0, 8),
      );
    } catch {
      setAworkResults([]);
    }
  };

  const handleAltstand = async (alle = false) => {
    setAltstandLoading(true);
    setAltstandMsg(null);
    try {
      const res = await base44.functions.invoke(
        'aworkAltstandBerechnen',
        alle ? { alle: true } : { project_id: project.id },
      );
      const data = res?.data || res;
      const erg = data.ergebnisse || [];
      if (alle) {
        const ok = erg.filter((e) => !e.hinweis).length;
        const skip = erg.filter((e) => e.hinweis).length;
        setAltstandMsg(`${ok} berechnet${skip ? `, ${skip} übersprungen` : ''}`);
      } else if (erg[0]) {
        setAltstandMsg(erg[0].hinweis || `${erg[0].stunden} h`);
      }
    } catch (err) {
      setAltstandMsg(`Fehler: ${err.message}`);
    }
    setAltstandLoading(false);
  };

  const selectedAworkName = form.awork_project_id
    ? aworkResults.find((p) => p.awork_project_id === form.awork_project_id)?.name
    : null;

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
        <Label>aWork-Projekt</Label>
        {form.awork_project_id ? (
          <div className="flex items-center gap-2">
            <span className="text-sm flex-1 truncate">{selectedAworkName || form.awork_project_id}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => set('awork_project_id')(null)}>
              entfernen
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Input
              placeholder="aWork-Projekt suchen…"
              value={aworkSearch}
              onChange={(e) => searchAwork(e.target.value)}
              onFocus={() => setShowAworkList(true)}
              onBlur={() => setTimeout(() => setShowAworkList(false), 200)}
            />
            {showAworkList && aworkResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full border rounded-md bg-white max-h-48 overflow-y-auto shadow-sm">
                {aworkResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-0"
                    onClick={() => {
                      set('awork_project_id')(p.awork_project_id);
                      setShowAworkList(false);
                      setAworkSearch('');
                      setAworkResults([]);
                    }}
                  >
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.company_name && <span className="text-xs text-muted-foreground ml-2">{p.company_name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={altstandLoading}
          onClick={() => handleAltstand(false)}
        >
          {altstandLoading ? 'Berechnet…' : 'aWork-Altstand neu berechnen'}
        </Button>
        {user?.role === 'admin' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={altstandLoading}
            onClick={() => handleAltstand(true)}
          >
            für alle Retainer
          </Button>
        )}
        {altstandMsg && <span className="text-xs text-muted-foreground">{altstandMsg}</span>}
      </div>
    </>
  );
}
