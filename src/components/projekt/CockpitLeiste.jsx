import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FolderKanban } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CockpitAuswahl from '@/components/projekt/CockpitAuswahl';
import { cockpitSicherstellen, cockpitLoesen } from '@/lib/projekt/cockpitSicherstellen';
import { projectTypeOf } from '@/components/sprint/projectTypes';

const LINK = 'inline-flex items-center gap-1.5 text-xs font-medium hover:underline';

// Verwaltungszeile im Projektkopf: Link zum Projekt-Cockpit (nur mit Finanzrecht).
// Verknüpfen, Ändern und Lösen sind Admin-Sache. Zeigt liquidity_project_id auf ein
// nicht mehr vorhandenes Cockpit, erscheint statt des Links der Reparaturhinweis.
export default function CockpitLeiste({ project, client, istAdmin, darfSehen = istAdmin, onSaved }) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [auswahl, setAuswahl] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const typ = projectTypeOf(project);

  const cockpitId = project?.liquidity_project_id || null;
  const { data: cockpit, isLoading } = useQuery({
    queryKey: ['verknuepftesCockpit', cockpitId],
    enabled: !!cockpitId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      (await base44.entities.LiquidityProject.get(cockpitId).catch(() => null)) || null,
  });

  if (!project || typ === 'intern') return null;

  const fertig = () => {
    queryClient.invalidateQueries({ queryKey: ['verknuepftesCockpit'] });
    queryClient.invalidateQueries({ queryKey: ['belegteCockpitIds'] });
    queryClient.invalidateQueries({ queryKey: ['freieCockpits'] });
    onSaved?.();
  };

  const speichern = async () => {
    setLaeuft(true);
    setFehler('');
    try {
      await cockpitSicherstellen({
        project,
        clientName: client?.name,
        typ,
        pmEmail: project.pm_email,
        bestehendesCockpitId: auswahl || undefined,
      });
      setOffen(false);
      setAuswahl('');
      fertig();
    } catch (e) {
      setFehler(e.message);
    }
    setLaeuft(false);
  };

  const loesen = async () => {
    const ok = window.confirm(
      'Verknüpfung zum Projekt-Cockpit lösen? Beide Datensätze bleiben erhalten, nur die Zuordnung wird aufgehoben.'
    );
    if (!ok) return;
    setLaeuft(true);
    setFehler('');
    try {
      await cockpitLoesen({ project });
      fertig();
    } catch (e) {
      setFehler(e.message);
    }
    setLaeuft(false);
  };

  const dialog = (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Projekt-Cockpit</DialogTitle></DialogHeader>
        {cockpit && (
          <p className="text-xs text-muted-foreground">
            Aktuell verknüpft: {cockpit.project_name}. Eine andere Auswahl hängt das Projekt um —
            das bisherige Cockpit bleibt erhalten und wird frei.
          </p>
        )}
        <CockpitAuswahl customer={client?.name} value={auswahl} onChange={setAuswahl} />
        {fehler && <p className="text-sm text-status-critical">{fehler}</p>}
        <div className="flex justify-end">
          <Button disabled={laeuft} onClick={speichern}>{laeuft ? 'Speichert…' : 'Übernehmen'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Verknüpft und vorhanden — oder noch am Laden: bisherige Darstellung, kein Flackern.
  if (cockpitId && (cockpit || isLoading)) {
    if (!darfSehen && !istAdmin) return null;
    return (
      <>
        {darfSehen && (
          <Link to={`/projects/${cockpitId}`} className={`${LINK} text-muted-foreground hover:text-foreground`}>
            <FolderKanban className="w-3.5 h-3.5" /> Projekt-Cockpit
          </Link>
        )}
        {istAdmin && !isLoading && (
          <>
            <button type="button" onClick={() => { setAuswahl(''); setFehler(''); setOffen(true); }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
              ändern
            </button>
            <button type="button" onClick={loesen} disabled={laeuft}
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50">
              lösen
            </button>
          </>
        )}
        {fehler && <span className="text-xs text-status-critical">{fehler}</span>}
        {dialog}
      </>
    );
  }

  // Ohne Verknüpfung oder mit toter Referenz: Reparatur ist Admin-Sache.
  // Kollegen sehen weder Hinweis noch einen ins Leere führenden Link.
  if (!istAdmin) return null;

  return (
    <>
      <button type="button" onClick={() => { setAuswahl(''); setFehler(''); setOffen(true); }}
        className={`${LINK} text-status-attention`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        {cockpitId ? 'Verknüpftes Cockpit existiert nicht mehr — neu verknüpfen' : 'Kein Projekt-Cockpit — verknüpfen'}
      </button>
      {dialog}
    </>
  );
}
