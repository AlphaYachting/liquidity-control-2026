import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, CheckCircle2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function AworkProjectPicker({ open, onClose, onSelect, selectedProjectId }) {
  const [search, setSearch] = useState('');

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ['awork-project-snapshots'],
    queryFn: () => base44.entities.AworkProjectSnapshot.list('-last_synced_at', 200),
    enabled: open
  });

  const filtered = snapshots.filter(p =>
    !p.is_archived && (
      !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.project_key?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const statusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('abgeschlossen') || s.includes('completed') || s.includes('done')) return 'bg-emerald-100 text-emerald-700';
    if (s.includes('aktiv') || s.includes('progress') || s.includes('in bearbeitung')) return 'bg-blue-100 text-blue-700';
    if (s.includes('pause') || s.includes('hold')) return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>awork Projekt auswählen</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Projekt suchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5 mt-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Lade Projekte...
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-center py-8 text-sm text-muted-foreground">
              Keine Projekte gefunden. Bitte zuerst Sync durchführen.
            </p>
          )}
          {filtered.map(proj => (
            <button
              key={proj.id}
              onClick={() => onSelect(proj)}
              className={`w-full text-left p-3 rounded-lg border transition-all hover:bg-muted/50 ${
                selectedProjectId === proj.awork_project_id
                  ? 'border-primary bg-primary/5'
                  : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{proj.name}</span>
                    {selectedProjectId === proj.awork_project_id && (
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </div>
                  {proj.company_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{proj.company_name}</p>
                  )}
                  {proj.responsible_user_name && (
                    <p className="text-xs text-muted-foreground">PM: {proj.responsible_user_name}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(proj.project_status)}`}>
                    {proj.project_status || 'Unbekannt'}
                  </span>
                  {proj.progress_percent > 0 && (
                    <span className="text-xs text-muted-foreground">{proj.progress_percent}%</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}