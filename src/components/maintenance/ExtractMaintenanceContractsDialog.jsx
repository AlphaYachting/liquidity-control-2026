import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

const KEYWORDS_BY_TYPE = {
  maintenance: ['wartung', 'wartungsvertrag', 'wartungsvereinbarung', 'maintenance'],
  support: ['support'],
  other: ['hosting', 'ssl'],
};

function detectType(notes = '') {
  const lower = notes.toLowerCase();
  if (lower.includes('hosting') || lower.includes('ssl')) return 'other';
  if (lower.includes('wartung') || lower.includes('maintenance')) return 'maintenance';
  if (lower.includes('support')) return 'support';
  return 'maintenance';
}

function extractContractName(notes = '') {
  // Try to get the part after the pipe
  const parts = notes.split('|');
  if (parts.length > 1) return parts[parts.length - 1].trim();
  return notes.trim();
}

async function buildProposals() {
  const invoices = await base44.entities.InvoiceRecord.list('-invoice_date', 500);

  const relevant = invoices.filter(i => {
    if (!i.invoice_date) return false;
    const year = new Date(i.invoice_date).getFullYear();
    if (year < 2025 || year > 2026) return false;
    const text = (i.notes || '').toLowerCase();
    return Object.values(KEYWORDS_BY_TYPE).flat().some(kw => text.includes(kw));
  });

  // Group by customer + detected type
  const grouped = {};
  for (const inv of relevant) {
    const type = detectType(inv.notes);
    const key = `${inv.customer_name}__${type}`;
    if (!grouped[key]) grouped[key] = { customer: inv.customer_name, type, invoices: [] };
    grouped[key].invoices.push(inv);
  }

  return Object.values(grouped).map(g => {
    const nets = g.invoices.map(i => i.net_amount || 0);
    const avgNet = Math.round(nets.reduce((s, v) => s + v, 0) / nets.length * 100) / 100;
    const isRecurring = nets.length > 1 && nets.every(v => Math.abs(v - nets[0]) < 1);
    const sampleNote = g.invoices[0]?.notes || '';
    const contractName = extractContractName(sampleNote);

    return {
      key: `${g.customer}__${g.type}`,
      customer: g.customer,
      contract_type: g.type,
      project_name: contractName,
      count: g.invoices.length,
      monthly_fixed_price: isRecurring ? avgNet : 0,
      annual_amount: isRecurring ? Math.round(avgNet * 12 * 100) / 100 : Math.round(nets.reduce((s, v) => s + v, 0) * 100) / 100,
      billing_interval: isRecurring ? 'monthly' : 'by_effort',
      status: 'active',
      isRecurring,
      avgNet,
      sampleNotes: [...new Set(g.invoices.map(i => i.notes).filter(Boolean))].slice(0, 2),
    };
  }).sort((a, b) => b.count - a.count);
}

const TYPE_LABELS = { maintenance: 'Wartung', support: 'Support', other: 'Hosting/SSL' };
const TYPE_COLORS = { maintenance: 'bg-blue-100 text-blue-700', support: 'bg-purple-100 text-purple-700', other: 'bg-emerald-100 text-emerald-700' };

export default function ExtractMaintenanceContractsDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState({});
  const [imported, setImported] = useState(false);

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['maintenanceProposals'],
    queryFn: buildProposals,
    enabled: open,
    staleTime: 0,
  });

  const { data: existing = [] } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => base44.entities.RecurringContract.list(),
    enabled: open,
  });

  // Pre-select all on load
  useEffect(() => {
    if (proposals.length > 0 && Object.keys(selected).length === 0) {
      const initial = {};
      proposals.forEach(p => { initial[p.key] = true; });
      setSelected(initial);
    }
  }, [proposals]);

  const importMutation = useMutation({
    mutationFn: async (toImport) => {
      for (const p of toImport) {
        await base44.entities.RecurringContract.create({
          contract_type: p.contract_type,
          customer: p.customer,
          project_name: p.project_name,
          monthly_fixed_price: p.monthly_fixed_price,
          annual_amount: p.annual_amount,
          billing_interval: p.billing_interval,
          status: p.status,
          notes: `Automatisch extrahiert aus ${p.count} sevDesk-Rechnung(en) 2025/2026`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setImported(true);
    },
  });

  const existingCustomers = new Set(existing.map(e => e.customer));

  const selectedProposals = proposals.filter(p => selected[p.key] && !existingCustomers.has(p.customer));

  const handleImport = () => {
    importMutation.mutate(selectedProposals);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Wartungsverträge aus sevDesk extrahieren
          </DialogTitle>
          <DialogDescription>
            Analyse der sevDesk-Rechnungen 2025/2026 — Wartung, Support & Hosting erkannt. Wähle die Einträge die du importieren möchtest.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Rechnungen werden analysiert...</span>
          </div>
        ) : imported ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <p className="text-base font-semibold">Import erfolgreich!</p>
            <p className="text-sm text-muted-foreground">{selectedProposals.length} Verträge wurden angelegt.</p>
            <Button onClick={onClose}>Schließen</Button>
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-2">
              {proposals.length} Vertragsgruppen erkannt · {proposals.filter(p => existingCustomers.has(p.customer)).length} bereits vorhanden (ausgegraut)
            </div>

            <div className="space-y-2">
              {proposals.map(p => {
                const alreadyExists = existingCustomers.has(p.customer);
                return (
                  <div key={p.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-sm transition-colors ${alreadyExists ? 'opacity-40 bg-muted/30' : selected[p.key] ? 'bg-primary/5 border-primary/30' : 'bg-white'}`}>
                    <Checkbox
                      checked={!!selected[p.key] && !alreadyExists}
                      disabled={alreadyExists}
                      onCheckedChange={v => setSelected(s => ({ ...s, [p.key]: v }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{p.customer}</span>
                        <Badge className={`text-xs py-0 ${TYPE_COLORS[p.contract_type]}`}>
                          {TYPE_LABELS[p.contract_type]}
                        </Badge>
                        {p.isRecurring && <Badge className="text-xs py-0 bg-emerald-100 text-emerald-700">Fixbetrag</Badge>}
                        {alreadyExists && <Badge className="text-xs py-0 bg-gray-100 text-gray-500">Bereits vorhanden</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.project_name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{p.count} Rechnung(en)</span>
                        <span>Ø {p.avgNet.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}/Monat</span>
                        <span>Jahreswert: {p.annual_amount.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}</span>
                        <span className="italic">{p.billing_interval === 'monthly' ? 'monatlich' : 'nach Aufwand'}</span>
                      </div>
                      {p.sampleNotes.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">„{p.sampleNotes[0]}"</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <span className="text-sm text-muted-foreground">
                {selectedProposals.length} von {proposals.length} ausgewählt
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Abbrechen</Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedProposals.length === 0 || importMutation.isPending}
                  className="gap-2">
                  {importMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {selectedProposals.length} Verträge importieren
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}