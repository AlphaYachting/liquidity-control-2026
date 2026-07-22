import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles } from 'lucide-react';
import { SIGNERS } from '@/components/crm/proposals/proposalConfig';
import { buildLargeTextPatch } from '@/components/crm/proposals/jsonFields';
import { extractContext } from '@/components/crm/proposals/proposalReasoning';
import { composeDocsText } from '@/components/crm/proposals/sourceDocs';
import SourceDocumentsPanel from '@/components/crm/proposals/SourceDocumentsPanel';

export default function ProposalCreateDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [text, setText] = useState('');
  const [mode, setMode] = useState('full');
  const [sprint, setSprint] = useState(false);
  const [signedBy, setSignedBy] = useState(SIGNERS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const hasInput = docs.length > 0 || text.trim();

  const handleCreate = async () => {
    setSaving(true); setError(null);
    try {
      const docsText = await composeDocsText(docs);
      const combined = [docsText, text.trim()].filter(Boolean).join('\n\n');
      // Kontext-Extraktion mit gekürztem Text; bei Fehler trotzdem anlegen —
      // die Detailseite zieht den Kontext vor der Analyse automatisch nach.
      let ctx = null;
      try {
        ctx = await extractContext(combined.slice(0, 30000));
      } catch {
        ctx = null;
      }
      const notesPatch = await buildLargeTextPatch('input_text', text, 'gespraechsnotizen.txt');
      const proposal = await base44.entities.CrmProposal.create({
        title: ctx?.proposal_title || ctx?.customer_company || 'Neues Angebot',
        customer_company: ctx?.customer_company || '',
        contact_person: ctx?.contact_person || '',
        client_core_business: ctx?.client_core_business || '',
        client_industry: ctx?.client_industry || '',
        client_target_audience: ctx?.client_target_audience || '',
        client_usp: ctx?.client_usp || '',
        client_existing_marketing: ctx?.client_existing_marketing || '',
        client_project_scope: ctx?.client_project_scope || '',
        source_documents: docs,
        mode, sprint_mode: sprint, signed_by: signedBy, status: 'input',
        ...notesPatch,
      });
      setSaving(false);
      onOpenChange(false);
      setText('');
      setDocs([]);
      navigate(`/crm/proposals/${proposal.id}?autostart=1`);
    } catch (e) {
      setError('Anlage fehlgeschlagen: ' + (e?.message || ''));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Neues visuelles Angebot</DialogTitle></DialogHeader>

        <SourceDocumentsPanel
          title="Erst-Input — Transkript, Kunden-E-Mail oder Sprachmemo"
          hint="Jeder Upload wird als eigenständiges Dokument abgelegt und getrennt verarbeitet."
          types={['transcript', 'email', 'voice_memo']}
          documents={docs}
          onAdd={(doc) => setDocs(d => [...d, doc])}
          onRemove={(idx) => setDocs(d => d.filter((_, i) => i !== idx))}
          disabled={saving}
        />

        <Separator />

        <SourceDocumentsPanel
          title="Zusätzliches Kundenbriefing (optional)"
          hint="Eigenständiger Kontext — fließt getrennt vom Erst-Input in die Angebotserstellung ein."
          types={['briefing']}
          documents={docs}
          onAdd={(doc) => setDocs(d => [...d, doc])}
          onRemove={(idx) => setDocs(d => d.filter((_, i) => i !== idx))}
          disabled={saving}
        />

        <div>
          <Label className="text-xs">Manuelle Notizen (optional)</Label>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Zusätzliche eigene Notizen — Dokumente bitte oben als Anhang hinzufügen…"
            className="mt-1 min-h-[100px] text-sm"
            disabled={saving}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">Modus</Label>
            <Tabs value={mode} onValueChange={setMode} className="mt-1">
              <TabsList className="w-full">
                <TabsTrigger value="full" className="flex-1 text-xs">Vollversion</TabsTrigger>
                <TabsTrigger value="short" className="flex-1 text-xs">Kurzform</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div>
            <Label className="text-xs">Signatur</Label>
            <Select value={signedBy} onValueChange={setSignedBy}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIGNERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={sprint} onCheckedChange={setSprint} id="sprint" disabled={saving} />
            <Label htmlFor="sprint" className="text-xs">Sprint (fester Liefertermin)</Label>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Abbrechen</Button>
          <Button onClick={handleCreate} disabled={!hasInput || saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {saving ? 'Kontext wird analysiert…' : 'Anlegen & Analyse starten'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}