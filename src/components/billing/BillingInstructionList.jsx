import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Copy, ExternalLink, ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/liquidityUtils';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const STATUS_CFG = {
  draft:                { label: 'Entwurf',                color: 'bg-gray-100 text-gray-600' },
  ready_for_backoffice: { label: 'Bereit',                 color: 'bg-emerald-100 text-emerald-700' },
  sent_to_backoffice:   { label: 'An Backoffice gesendet', color: 'bg-blue-100 text-blue-700' },
  invoice_created:      { label: 'Rechnung erstellt',      color: 'bg-purple-100 text-purple-700' },
  paid:                 { label: 'Bezahlt',                color: 'bg-teal-100 text-teal-700' },
  blocked:              { label: 'Blockiert',              color: 'bg-red-100 text-red-700' },
  cancelled:            { label: 'Storniert',              color: 'bg-gray-200 text-gray-500' },
};

const TYPE_LABELS = {
  package_based:      'Paket',
  percentage_based:   'Prozentual',
  manual_amount:      'Frei',
};

const INVOICE_TYPE_LABELS = {
  advance_invoice: 'Anzahlung',
  partial_invoice: 'Teilrechnung',
  final_invoice:   'Schlussrechnung',
  correction:      'Korrektur',
  credit_note:     'Gutschrift',
};

const BACKOFFICE_USERS = ['Anna', 'Birgit', 'Christine', 'Maria'];

export default function BillingInstructionList({ instructions, projectBlocks, onUpdate, onDelete, onDuplicate }) {
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [creatingDraft, setCreatingDraft] = useState(null);

  async function handleCreateSevdeskDraft(instrId) {
    setCreatingDraft(instrId);
    try {
      const res = await base44.functions.invoke('createSevdeskInvoiceDraft', { billing_instruction_id: instrId });
      const data = res.data;
      if (data?.sevdesk_url) {
        toast.success('Rechnungsentwurf in sevDesk angelegt', {
          description: 'Entwurf wird geöffnet…',
          action: { label: 'Öffnen', onClick: () => window.open(data.sevdesk_url, '_blank') }
        });
        window.open(data.sevdesk_url, '_blank');
      } else {
        toast.success(data?.message || 'Entwurf angelegt');
      }
      if (onUpdate) onUpdate(instrId, { status: 'invoice_created', invoice_created_at: new Date().toISOString() });
    } catch (e) {
      toast.error('Fehler beim Anlegen des Rechnungsentwurfs', { description: e?.response?.data?.error || e.message });
    } finally {
      setCreatingDraft(null);
    }
  }

  if (instructions.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground border rounded-xl border-dashed">
        Noch keine Abrechnungsanweisungen. Klicke "+ Abrechnungsanweisung erstellen".
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Abrechnungsanweisungen ({instructions.length})</p>
      {instructions.map(instr => {
        const sc = STATUS_CFG[instr.status] || STATUS_CFG.draft;
        const linkedBlock = projectBlocks.find(b => b.id === instr.billing_block_id);
        const isExpanded = expandedId === instr.id;

        return (
          <div key={instr.id} className="border rounded-xl hover:shadow-sm transition-shadow">
            {/* Main row */}
            <div className="p-3 flex flex-col md:flex-row md:items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge className={`text-xs ${sc.color}`}>{sc.label}</Badge>
                  <Badge variant="outline" className="text-xs">{TYPE_LABELS[instr.instruction_type] || '—'}</Badge>
                  <Badge variant="outline" className="text-xs">{INVOICE_TYPE_LABELS[instr.invoice_type] || '—'}</Badge>
                  {instr.additional_billing_percent > 0 && (
                    <span className="text-xs text-muted-foreground">+{Math.round(instr.additional_billing_percent)}%</span>
                  )}
                </div>
                {instr.invoice_reason && (
                  <p className="text-xs text-muted-foreground truncate">{instr.invoice_reason}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  {linkedBlock && <span>📦 {linkedBlock.title}</span>}
                  {instr.planned_invoice_date && <span>📅 {instr.planned_invoice_date}</span>}
                  {instr.assigned_backoffice_user && <span>👤 {instr.assigned_backoffice_user}</span>}
                  {instr.requested_by_pm && <span>PM: {instr.requested_by_pm}</span>}
                  {instr.linked_invoice_id && <span className="text-primary">🔗 Rechnung verknüpft</span>}
                  {instr.sevdesk_invoice_id && (
                    <a href={instr.sevdesk_invoice_url || `https://my.sevdesk.de/#/fi/${instr.sevdesk_invoice_id}`} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-0.5">
                      <ExternalLink className="w-3 h-3" /> sevDesk Entwurf
                    </a>
                  )}
                  {instr.created_date && <span className="text-muted-foreground/60">{format(new Date(instr.created_date), 'dd.MM.yy')}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  <p className="font-bold text-sm">{formatCurrency(instr.instruction_amount_net)}</p>
                  <p className="text-xs text-muted-foreground">netto</p>
                </div>

                {/* Quick status */}
                <Select value={instr.status} onValueChange={v => onUpdate(instr.id, { status: v, ...(v === 'sent_to_backoffice' ? { sent_to_backoffice_at: new Date().toISOString() } : {}), ...(v === 'invoice_created' ? { invoice_created_at: new Date().toISOString() } : {}) })}>
                  <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CFG).map(([v, { label }]) => (
                      <SelectItem key={v} value={v} className="text-xs">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {confirmDelete === instr.id ? (
                  <>
                    <span className="text-xs text-destructive font-medium">Löschen?</span>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { onDelete(instr.id); setConfirmDelete(null); }}>Ja</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmDelete(null)}>Nein</Button>
                  </>
                ) : (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(instr.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedId(isExpanded ? null : instr.id)}>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            {/* Expanded */}
            {isExpanded && (
              <div className="px-3 pb-3 pt-0 border-t bg-muted/20 rounded-b-xl space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs pt-3">
                  <div>
                    <p className="text-muted-foreground font-medium">Auftragswert netto</p>
                    <p>{formatCurrency(instr.total_order_net)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Bereits abgerechnet</p>
                    <p>{formatCurrency(instr.already_invoiced_net)} ({Math.round(instr.previous_billing_percent || 0)}%)</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Neuer Stand nach Anweisung</p>
                    <p className="font-semibold">{Math.round(instr.new_billing_percent || 0)}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">awork Fortschritt (Snapshot)</p>
                    <p>{instr.awork_progress_percent > 0 ? `${Math.round(instr.awork_progress_percent)}%` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Brutto ({instr.vat_rate}% MwSt.)</p>
                    <p className="font-semibold">{formatCurrency(instr.instruction_amount_gross)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium">Zuständig Backoffice</p>
                    <Select value={instr.assigned_backoffice_user || ''} onValueChange={v => onUpdate(instr.id, { assigned_backoffice_user: v })}>
                      <SelectTrigger className="h-6 text-xs mt-0.5"><SelectValue placeholder="Auswählen..." /></SelectTrigger>
                      <SelectContent>
                        {BACKOFFICE_USERS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {instr.invoice_reason && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Abrechnungsgrund</p>
                    <p className="text-xs mt-0.5">{instr.invoice_reason}</p>
                  </div>
                )}
                {instr.invoice_instruction_text && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Rechnungstext / Anweisung</p>
                    <p className="text-xs mt-0.5 bg-white rounded-lg p-2 border">{instr.invoice_instruction_text}</p>
                  </div>
                )}
                {instr.internal_note && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Interne Notiz</p>
                    <p className="text-xs mt-0.5 italic text-muted-foreground">{instr.internal_note}</p>
                  </div>
                )}
                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {(instr.status === 'draft' || instr.status === 'blocked') && (
                    <Button size="sm" className="h-7 text-xs"
                      onClick={() => onUpdate(instr.id, { status: 'ready_for_backoffice' })}>
                      ✓ Bereit für Backoffice
                    </Button>
                  )}
                  {instr.status === 'ready_for_backoffice' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => onUpdate(instr.id, { status: 'sent_to_backoffice', sent_to_backoffice_at: new Date().toISOString() })}>
                      ✓ Als gesendet markieren
                    </Button>
                  )}
                  {instr.status === 'sent_to_backoffice' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs border-purple-300 text-purple-700"
                      onClick={() => onUpdate(instr.id, { status: 'invoice_created', invoice_created_at: new Date().toISOString() })}>
                      ✓ Rechnung erstellt
                    </Button>
                  )}
                  {/* sevDesk Rechnungsentwurf */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                    disabled={creatingDraft === instr.id}
                    onClick={() => instr.sevdesk_invoice_id
                      ? window.open(instr.sevdesk_invoice_url || `https://my.sevdesk.de/#/fi/${instr.sevdesk_invoice_id}`, '_blank')
                      : handleCreateSevdeskDraft(instr.id)
                    }
                  >
                    {creatingDraft === instr.id
                      ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Wird angelegt…</>
                      : instr.sevdesk_invoice_id
                        ? <><ExternalLink className="w-3 h-3 mr-1" /> In sevDesk öffnen</>
                        : <><FileText className="w-3 h-3 mr-1" /> Rechnungsentwurf erzeugen</>
                    }
                  </Button>

                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onDuplicate(instr)}>
                    <Copy className="w-3 h-3 mr-1" /> Duplizieren
                  </Button>
                  {confirmDelete === instr.id ? (
                    <>
                      <span className="text-xs text-destructive">Wirklich löschen?</span>
                      <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { onDelete(instr.id); setConfirmDelete(null); }}>Ja</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmDelete(null)}>Nein</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                      onClick={() => setConfirmDelete(instr.id)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Löschen
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}