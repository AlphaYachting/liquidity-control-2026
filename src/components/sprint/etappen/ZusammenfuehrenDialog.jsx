import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { etappenText, zusammenfuehren } from '@/lib/sprint/doppelteStandardaufgaben';

const h = (v) => (Number(v) || 0).toLocaleString('de-AT', { maximumFractionDigits: 1 });

// Führungskräfte: doppelte Standardaufgaben eines mehrfach gewählten Moduls zu je einer
// Aufgabe mit dem Etappennamen zusammenführen. Die alten Aufgaben werden archiviert
// (Grund „doppelt") und lassen sich unter „Aufgaben bereinigen" wiederherstellen.
export default function ZusammenfuehrenDialog({ open, onOpenChange, vorschlaege = [], projectId, onDone }) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  const modulIds = [...new Set(vorschlaege.map((v) => v.modulId))];
  const { data: modulNamen = [] } = useQuery({
    queryKey: ['modulNamen', ...modulIds],
    enabled: open && modulIds.length > 0,
    queryFn: () => Promise.all(modulIds.map((id) => base44.entities.ModuleTemplate.get(id).then((m) => m?.name).catch(() => null))),
  });
  const namen = modulNamen.filter(Boolean);

  const alt = vorschlaege.reduce((n, v) => n + v.alte.length, 0);
  const titelliste = [...new Set(vorschlaege.flatMap((v) => v.alte.map((t) => t.title)))];

  const ausfuehren = async () => {
    setLaeuft(true);
    setFehler('');
    try {
      const r = await zusammenfuehren(vorschlaege, projectId);
      const rest = r.abgelehnt?.length ? ` ${r.abgelehnt.length} Aufgaben wurden nicht angefasst (${r.abgelehnt[0].grund}).` : '';
      onDone?.(`${r.alt} Standardaufgaben zu ${r.neu} Aufgaben zusammengeführt — je Etappe eine Aufgabe mit dem Etappennamen. Die alten liegen im Archiv.${rest}`);
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.message || 'Zusammenführen fehlgeschlagen.');
    }
    setLaeuft(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Aufgaben bereinigen</DialogTitle></DialogHeader>

        <div className="space-y-3.5 text-sm">
          <p>
            Beim Anlegen wurden die {etappenText(vorschlaege)} {namen.length ? <>dem Modul „{namen.join('“, „')}“</> : 'demselben Modul'} zugeordnet.
            Jede Etappe bekam dessen Standardaufgaben: {titelliste.join(', ')}.
          </p>

          {vorschlaege.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#555555]">Vorschlag: je Etappe eine Aufgabe mit dem Etappennamen</p>
              <div className="rounded border border-border">
                {vorschlaege.map((v) => (
                  <div key={v.milestone.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 text-[13px] last:border-0">
                    <span className="flex-[1_1_280px]">{v.milestone.title}</span>
                    <span className="text-muted-foreground">{v.alte.length} Aufgaben · 0 h gebucht</span>
                    <span className="font-semibold">→ 1 Aufgabe ({h(v.neu.target_hours)} h)</span>
                  </div>
                ))}
              </div>
              <p className="text-[13px] text-muted-foreground">
                Bleibt unverändert: jede Etappe, in der schon gearbeitet oder Zeit gebucht wurde, und die erste Etappe des Moduls.
              </p>
            </div>
          ) : (
            <p className="text-status-done-text">Keine doppelten Standardaufgaben mehr.</p>
          )}
          <p className="text-[13px] text-muted-foreground">Neue Projekte legen bei einem wiederholten Modul nur noch eine Aufgabe je Etappe an.</p>
          {fehler && <p className="text-status-critical">{fehler}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          {vorschlaege.length > 0 && (
            <Button onClick={ausfuehren} disabled={laeuft}>
              {laeuft ? 'Führt zusammen…' : `${alt} Aufgaben zu ${vorschlaege.length} zusammenführen`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
