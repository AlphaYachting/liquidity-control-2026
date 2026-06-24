import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Server, CheckCircle2, AlertCircle, Globe } from 'lucide-react';

const HOSTING_KEYWORDS = ['hosting', 'webhosting', 'server', 'vserver', 'vps', 'cloud', 'ssl', 'zertifikat', 'backup', 'speicher'];
const DOMAIN_KEYWORDS = ['domain', '.at', '.com', '.net', '.org', '.eu', '.de', 'registrierung', 'registrar', 'nameserver', 'dns'];

function detectContractType(text) {
  const lower = (text || '').toLowerCase();
  if (DOMAIN_KEYWORDS.some(kw => lower.includes(kw))) return 'domain';
  if (HOSTING_KEYWORDS.some(kw => lower.includes(kw))) return 'hosting';
  return null;
}

function detectInterval(invoicesPerYear) {
  if (invoicesPerYear >= 10) return 'monthly';
  if (invoicesPerYear >= 3) return 'quarterly';
  return 'yearly';
}

async function fetchAndAnalyze() {
  // Use synced sevDesk invoices from 2025
  const invoices = await base44.entities.InvoiceRecord.list('-invoice_date', 1000);

  const inv2025 = invoices.filter(i => {
    if (!i.invoice_date) return false;
    return new Date(i.invoice_date).getFullYear() === 2025;
  });

  // Search in notes, match_notes, customer_name for hosting/domain keywords
  const relevant = inv2025.filter(i => {
    const searchText = [i.notes, i.match_notes, i.customer_name, i.invoice_number].join(' ');
    return detectContractType(searchText) !== null;
  });

  // Group by customer + type
  const grouped = {};
  for (const inv of relevant) {
    const searchText = [inv.notes, inv.match_notes, inv.customer_name].join(' ');
    const type = detectContractType(searchText);
    const key = `${inv.customer_name}__${type}`;
    if (!grouped[key]) grouped[key] = { customer: inv.customer_name, type, invoices: [] };
    grouped[key].invoices.push(inv);
  }

  return Object.values(grouped).map(g => {
    const nets = g.invoices.map(i => i.net_amount || 0).filter(v => v > 0);
    const totalNet = nets.reduce((s, v) => s + v, 0);
    const avgNet = nets.length ? Math.round(totalNet / nets.length * 100) / 100 : 0;
    const isFixed = nets.length > 1 && nets.every(v => Math.abs(v - nets[0]) < 2);
    const interval = detectInterval(g.invoices.length);
    const annualAmount = interval === 'monthly' ? Math.round(avgNet * 12 * 100) / 100
      : interval === 'quarterly' ? Math.round(avgNet * 4 * 100) / 100
      : Math.round(totalNet * 100) / 100;

    const sampleNotes = [...new Set(g.invoices.map(i => i.notes).filter(Boolean))].slice(0, 2);
    const contractName = sampleNotes[0] || g.customer;

    return {
      key: `${g.customer}__${g.type}`,
      customer: g.customer,
      contract_type: g.type,
      project_name: contractName,
      count: g.invoices.length,
      monthly_fixed_price: interval === 'monthly' ? avgNet : 0,
      annual_amount: annualAmount,
      billing_interval: interval,
      status: 'active',
      isFixed,
      avgNet,
      totalNet,
      sampleNotes,
      invoiceNumbers: g.invoices.map(i => i.invoice_number).filter(Boolean).slice(0, 3),
    };
  }).sort((a, b) => b.count - a.count);
}

const TYPE_CONFIG = {
  hosting: { label: 'Hosting', color: 'bg-blue-100 text-blue-700', icon: Server },
  domain: { label: 'Domain', color: 'bg-violet-100 text-violet-700', icon: Globe },
};

const INTERVAL_LABELS = { monthly: 'monatlich', quarterly: 'quartalsweise', yearly: 'jährlich' };

export default function ExtractHostingContractsDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState({});
  const [imported, setImported] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: proposals = [], isLoading, error } = useQuery({
    queryKey: ['hostingProposals'],
    queryFn: fetchAndAnalyze,
    enabled: open,
    staleTime: 0,
  });

  const { data: existing = [] } = useQuery({
    queryKey: ['hosting-contracts'],
    queryFn: () => base44.entities.RecurringContract.list(),
    enabled: open,
  });

  // Pre-select all on first load
  useEffect(() => {
    if (proposals.length > 0 && !initialized) {
      const initial = {};
      proposals.forEach(p => { initial[p.key] = true; });
      setSelected(initial);
      setInitialized(true);
    }
  }, [proposals, initialized]);

  useEffect(() => {
    if (!open) { setImported(false); setInitialized(false); setSelected({}); }
  }, [open]);

  const existingKeys = new Set(existing.map(e => `${e.customer}__${e.contract_type}`));

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
          status: 'active',
          notes: `Extrahiert aus sevDesk 2025 · ${p.count} Rechnung(en) · Rechnungen: ${p.invoiceNumbers.join(', ')}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosting-contracts'] });
      setImported(true);
    },
  });

  const selectedProposals = proposals.filter(p => selected[p.key] && !existingKeys.has(p.key));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-500" />
            Hosting & Domains aus sevDesk extrahieren
          </DialogTitle>
          <DialogDescription>
            Analyse der lokalen sevDesk-Rechnungen aus 2025 — Hosting- und Domain-Rechnungen werden automatisch erkannt und gruppiert.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Rechnungen aus 2025 werden analysiert...</p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-8 text-destructive justify-center">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Fehler beim Laden der Rechnungen</span>
          </div>
        ) : imported ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <p className="text-base font-semibold">Import erfolgreich!</p>
            <p className="text-sm text-muted-foreground">{selectedProposals.length} Verträge wurden angelegt.</p>
            <Button onClick={onClose}>Schließen</Button>
          </div>
        ) : proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <AlertCircle className="w-8 h-8" />
            <p className="text-sm">Keine Hosting- oder Domain-Rechnungen in sevDesk 2025 gefunden.</p>
            <p className="text-xs">Stellen Sie sicher, dass sevDesk-Rechnungen aus 2025 synchronisiert sind.</p>
            <Button variant="outline" onClick={onClose}>Schließen</Button>
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-3">
              <span className="font-medium">{proposals.length}</span> Vertragsgruppen erkannt ·{' '}
              <span>{proposals.filter(p => existingKeys.has(p.key)).length}</span> bereits vorhanden
            </div>

            {/* Summary badges */}
            <div className="flex gap-2 mb-3 flex-wrap">
              <Badge className="bg-blue-100 text-blue-700">
                <Server className="w-3 h-3 mr-1" />
                {proposals.filter(p => p.contract_type === 'hosting').length} Hosting
              </Badge>
              <Badge className="bg-violet-100 text-violet-700">
                <Globe className="w-3 h-3 mr-1" />
                {proposals.filter(p => p.contract_type === 'domain').length} Domains
              </Badge>
            </div>

            <div className="space-y-2">
              {proposals.map(p => {
                const alreadyExists = existingKeys.has(p.key);
                const cfg = TYPE_CONFIG[p.contract_type] || TYPE_CONFIG.hosting;
                const TypeIcon = cfg.icon;
                return (
                  <div
                    key={p.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-sm transition-colors ${
                      alreadyExists ? 'opacity-40 bg-muted/30'
                      : selected[p.key] ? 'bg-primary/5 border-primary/30'
                      : 'bg-white'
                    }`}
                  >
                    <Checkbox
                      checked={!!selected[p.key] && !alreadyExists}
                      disabled={alreadyExists}
                      onCheckedChange={v => setSelected(s => ({ ...s, [p.key]: v }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TypeIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-semibold truncate">{p.customer}</span>
                        <Badge className={`text-xs py-0 ${cfg.color}`}>{cfg.label}</Badge>
                        {p.isFixed && <Badge className="text-xs py-0 bg-emerald-100 text-emerald-700">Fixbetrag</Badge>}
                        {alreadyExists && <Badge className="text-xs py-0 bg-gray-100 text-gray-500">Bereits vorhanden</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.project_name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{p.count} Rechnung(en) in 2025</span>
                        <span>Ø {p.avgNet.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}</span>
                        <span>Jahreswert: {p.annual_amount.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}</span>
                        <span className="italic">{INTERVAL_LABELS[p.billing_interval]}</span>
                      </div>
                      {p.invoiceNumbers.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">Rechnungen: {p.invoiceNumbers.join(', ')}{p.count > 3 ? ` +${p.count - 3} weitere` : ''}</p>
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
                  onClick={() => importMutation.mutate(selectedProposals)}
                  disabled={selectedProposals.length === 0 || importMutation.isPending}
                  className="gap-2"
                >
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