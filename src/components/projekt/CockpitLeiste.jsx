import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CockpitAuswahl from '@/components/projekt/CockpitAuswahl';
import { cockpitSicherstellen } from '@/lib/projekt/cockpitSicherstellen';
import { projectTypeOf } from '@/components/sprint/projectTypes';

const LINK = 'inline-flex items-center gap-1.5 text-xs font-medium hover:underline';

// Verwaltungszeile im Projektkopf: Link zum Projekt-Cockpit (nur mit Finanzrecht)
// oder — nur für Admins — der Hinweis, dass keines verknüpft ist.
export default function CockpitLeiste({ project, client, istAdmin, darfSehen = istAdmin, onSaved }) {
  const [offen, setOffen] = useState(false);
  const [auswahl, setAuswahl] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const typ = projectTypeOf(project);
  if (!project || typ === 'intern') return null;

  if (project.liquidity_project_id) {
    if (!darfSehen) return null;
    return (
      <Link to={`/projects/${project.liquidity_project_id}`} className={`${LINK} text-muted-foreground hover:text-foreground`}>
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
    <>
      <button type="button" onClick={() => setOffen(true)} className={`${LINK} text-status-attention`}>
        <AlertTriangle className="w-3.5 h-3.5" /> Kein Projekt-Cockpit — verknüpfen
      </button>
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
    </>
  );
}
