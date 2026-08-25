import React from 'react';
import { Button } from '@/components/ui/button';
import { Link2, RefreshCw, Loader2, ExternalLink, ListChecks } from 'lucide-react';
import Sektion from '@/components/projects/Sektion';
import Ampelpunkt from '@/components/sprint/Ampelpunkt';
import useProjektAufgaben from '@/hooks/useProjektAufgaben';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ENTRY_TYPES } from '@/components/projects/kundenakt/kundenaktConfig';

// Reine Leseansicht: geschrieben wird in awork, sonst gibt es zwei Wahrheiten über denselben Task.

const TAG = 86400000;

function arbeitstageSeit(iso) {
  if (!iso) return null;
  let tage = 0;
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  for (let t = d.getTime() + TAG; t <= heute.getTime(); t += TAG) {
    const wd = new Date(t).getDay();
    if (wd !== 0 && wd !== 6) tage += 1;
  }
  return tage;
}

function kalendertageBis(iso) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  return Math.round((d - heute) / TAG);
}

const kurzDatum = (iso) =>
  new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });

function fristText(iso) {
  const rest = kalendertageBis(iso);
  if (rest < 0) return `überfällig seit ${Math.abs(rest)} Tagen`;
  if (rest === 0) return 'heute';
  if (rest <= 7) return `in ${rest} Tagen`;
  return kurzDatum(iso);
}

function fristStatus(iso) {
  const rest = kalendertageBis(iso);
  if (rest < 0) return 'critical';
  if (rest <= 7) return 'attention';
  return 'plan';
}

function Gruppe({ titel, children }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{titel}</p>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Zeile({ status, titel, bearbeiter, hinweis, hinweisClass = 'text-muted-foreground', istZusage, onErledigt }) {
  const Handschlag = ENTRY_TYPES.vereinbarung.icon;
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      {status ? <Ampelpunkt status={status} /> : <span className="w-[10px] flex-shrink-0" />}
      <span className="flex-1 min-w-0 truncate" title={titel}>{titel}</span>
      {istZusage ? (
        <span className="w-28 flex items-center justify-end gap-1 text-xs text-muted-foreground">
          <Handschlag className="w-3.5 h-3.5" />
          <button type="button" onClick={onErledigt} className="hover:underline">erledigt</button>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground w-28 truncate text-right">{bearbeiter || '—'}</span>
      )}
      {hinweis && <span className={`text-xs w-44 text-right ${hinweisClass}`}>{hinweis}</span>}
    </div>
  );
}

export default function ProjektAufgabenListe({
  projectId, aworkProjectId, onSelectProject, onSync, isSyncing,
}) {
  const { aufgaben, kennzahlen, quelle } = useProjektAufgaben({ projectId, aworkProjectId });
  const queryClient = useQueryClient();

  const zusageErledigt = async (id) => {
    await base44.entities.ProjectFileEntry.update(id, { follow_up_done: true });
    queryClient.invalidateQueries({ queryKey: ['projektZusagen', projectId || null] });
  };

  if (quelle === 'intern' || !aworkProjectId) {
    return (
      <Sektion
        titel="Aufgaben"
        symbol={ListChecks}
        aktion={
          <Button size="sm" variant="outline" onClick={onSelectProject} className="h-7 text-xs">
            <Link2 className="w-3 h-3 mr-1" /> awork-Projekt verknüpfen
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">Kein awork-Projekt verknüpft</p>
      </Sektion>
    );
  }

  const haengtFest = aufgaben.filter(a => {
    if (a.herkunft === 'zusage') return a.faellig_am && kalendertageBis(a.faellig_am) < 0;
    if (a.ist_blockiert) return true;
    const tage = arbeitstageSeit(a.letzte_aktivitaet);
    return tage !== null && tage > 5;
  });
  const haengtIds = new Set(haengtFest.map(a => a.id));
  const uebrig = aufgaben.filter(a => !haengtIds.has(a.id));

  const faellig = uebrig
    .filter(a => a.faellig_am)
    .sort((a, b) => a.faellig_am.localeCompare(b.faellig_am))
    .slice(0, 8);

  const ohneTermin = uebrig.filter(a => !a.faellig_am);
  const ohneTerminSichtbar = ohneTermin.slice(0, 5);

  const standLabel = kennzahlen.zuletzt_synchronisiert
    ? kurzDatum(kennzahlen.zuletzt_synchronisiert)
    : null;

  return (
    <Sektion
      titel="Aufgaben"
      symbol={ListChecks}
      aktion={
        <a
          href={`https://app.awork.com/projects/${aworkProjectId}`}
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" /> in awork
        </a>
      }
    >

      {kennzahlen.daten_veraltet && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Stand vom {standLabel || '—'}</p>
          <Button size="sm" variant="ghost" onClick={onSync} disabled={isSyncing} className="h-6 text-xs">
            {isSyncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            Synchronisieren
          </Button>
        </div>
      )}

      {aufgaben.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Aufgaben.</p>
      ) : (
        <div className="space-y-4">
          {haengtFest.length > 0 && (
            <Gruppe titel="Hängt fest">
              {haengtFest.map(a => {
                const tage = arbeitstageSeit(a.letzte_aktivitaet);
                return (
                  <Zeile
                    key={a.id}
                    status="critical"
                    titel={a.titel}
                    bearbeiter={a.bearbeiter}
                    istZusage={a.herkunft === 'zusage'}
                    onErledigt={() => zusageErledigt(a.id)}
                    hinweis={a.herkunft === 'zusage'
                      ? `Zusage ${fristText(a.faellig_am)}`
                      : a.ist_blockiert ? 'blockiert' : `seit ${tage} Arbeitstagen ohne Bewegung`}
                    hinweisClass="text-status-critical"
                  />
                );
              })}
            </Gruppe>
          )}

          {faellig.length > 0 && (
            <Gruppe titel="Als nächstes fällig">
              {faellig.map(a => (
                <Zeile
                  key={a.id}
                  status={fristStatus(a.faellig_am)}
                  titel={a.titel}
                  bearbeiter={a.bearbeiter}
                  istZusage={a.herkunft === 'zusage'}
                  onErledigt={() => zusageErledigt(a.id)}
                  hinweis={fristText(a.faellig_am)}
                  hinweisClass={fristStatus(a.faellig_am) === 'critical' ? 'text-status-critical' : 'text-muted-foreground'}
                />
              ))}
            </Gruppe>
          )}

          {ohneTermin.length > 0 && (
            <Gruppe titel="Ohne Termin">
              {ohneTerminSichtbar.map(a => (
                <Zeile key={a.id} status={null} titel={a.titel} bearbeiter={a.bearbeiter} />
              ))}
              {ohneTermin.length > ohneTerminSichtbar.length && (
                <p className="text-xs text-muted-foreground pt-1.5">
                  und {ohneTermin.length - ohneTerminSichtbar.length} weitere
                </p>
              )}
            </Gruppe>
          )}
        </div>
      )}
    </Sektion>
  );
}