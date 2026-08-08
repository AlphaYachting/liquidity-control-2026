import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Link2, Plus } from 'lucide-react';
import { PIPELINES } from '@/components/crm/stages';

// Beim Übernehmen einer Anfrage existiert bereits ein offener Deal (egal welche Pipeline):
// zuordnen statt duplizieren — oder bewusst trotzdem neu anlegen.
export default function InboxDuplicateDialog({ open, onOpenChange, deal, onAttach, onCreateAnyway, busy, error }) {
  if (!deal) return null;
  const pipeline = PIPELINES[deal.pipeline]?.label || deal.pipeline;
  const stage = PIPELINES[deal.pipeline]?.stages.find(s => s.key === deal.stage)?.label || deal.stage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Deal existiert bereits
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Zu diesem Kontakt gibt es bereits einen offenen Deal — jede Anfrage sollte nicht zu einem neuen Lead werden.
          </p>
          <div className="border rounded-lg px-3 py-2.5 bg-muted/40">
            <p className="text-sm font-semibold">{deal.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {[deal.company_name, deal.contact_email].filter(Boolean).join(' · ')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{pipeline} · {stage}</p>
          </div>
          {error && (
            <div className="border border-red-200 bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700">
              <strong>Zuordnung fehlgeschlagen:</strong> {error}
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={onAttach} disabled={busy} className="gap-2 justify-start">
              <Link2 className="w-4 h-4" /> {busy ? 'Wird zugeordnet…' : error ? 'Erneut versuchen' : 'Anfrage diesem Deal zuordnen'}
            </Button>
            <Button variant="outline" onClick={onCreateAnyway} disabled={busy} className="gap-2 justify-start">
              <Plus className="w-4 h-4" /> Trotzdem neuen Deal anlegen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}