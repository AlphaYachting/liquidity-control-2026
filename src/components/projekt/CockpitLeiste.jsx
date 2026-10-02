import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CockpitAuswahl from '@/components/projekt/CockpitAuswahl';
import { cockpitSicherstellen } from '@/lib/projekt/cockpitSicherstellen';
import { projectTypeOf } from '@/components/sprint/projectTypes';

// Projektkopf: Link zum Projekt-Cockpit oder Hinweis, wenn keines verknüpft ist.
export default function CockpitLeiste({ project, client, istAdmin, onSaved }) {
  const [offen, setOffen] = useState(false);
  const [auswahl, setAuswahl] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const typ = projectTypeOf(project);
  if (!project || typ === 'intern') return null;

  if (project.liquidity_project_id) {
    return (
      <Link to={`/projects/${project.liquidity_project_id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
        <FolderKanban className="w-3.5 h-3.5" /> Projekt-Cockpit
      </Link>
    );
  }

  // Fehlendes Cockpit ist Admin-Sache: Kollegen sehen weder Hinweis noch Verknüpfen-Funktion.
  if (!istAdmin) return null;

  const speichern = async () => {
    setLaeuft(true);
    setFehler('');
    try {
      await cockpitSicherstellen({ project, clientName: client?.name, typ, pmEmail: project.pm_email, bestehendesCockpitId: auswahl || undefined });
      setOffen(false);
      onSaved?.();
    } catch (e) {
      setFehler(e.message);
    }
    setLaeuft(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-status-attention/40 bg-status-attention-surface px-4 py-2 text-sm text-status-attention">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">Kein Projekt-Cockpit verknüpft</span>
      <Button size="sm" variant="outline" onClick={() => setOffen(true)}>Cockpit anlegen oder verknüpfen</Button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Projekt-Cockpit</DialogTitle></DialogHeader>
          <CockpitAuswahl customer={client?.name} value={auswahl} onChange={setAuswahl} />
          {fehler && <p className="text-sm text-status-critical">{fehler}</p>}
          <div className="flex justify-end">
            <Button disabled={laeuft} onClick={speichern}>{laeuft ? 'Speichert…' : 'Übernehmen'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}