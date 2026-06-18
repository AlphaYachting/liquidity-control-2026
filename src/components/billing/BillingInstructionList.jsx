import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Pencil, Trash2, Copy, ExternalLink, ChevronDown, ChevronUp,
  FileText, Loader2, Send, CheckCircle2, Clock, CircleDot, AlertCircle
} from 'lucide-react';
import { formatCurrency } from '@/lib/liquidityUtils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import BillingInstructionEditDialog from './BillingInstructionEditDialog';

const STATUS_CFG = {
  draft:                { label: 'Entwurf',                color: 'bg-gray-100 text-gray-600',     icon: CircleDot },
  ready_for_backoffice: { label: 'Bereit',                 color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  sent_to_backoffice:   { label: 'An Backoffice gesendet', color: 'bg-blue-100 text-blue-700',     icon: Send },
  invoice_created:      { label: 'Rechnung erstellt',      color: 'bg-purple-100 text-purple-700', icon: FileText },
  paid:                 { label: 'Bezahlt',                color: 'bg-teal-100 text-teal-700',     icon: CheckCircle2 },
  blocked:              { label: 'Blockiert',              color: 'bg-red-100 text-red-700',       icon: AlertCircle },
  cancelled:            { label: 'Storniert',              color: 'bg-gray-200 text-gray-500',     icon: CircleDot },
};

const TYPE_LABELS = {
  package_based:    'Paket',
  percentage_based: 'Prozentual',
  manual_amount:    'Frei',
};

const INVOICE_TYPE_LABELS = {
  advance_invoice: 'Anzahlung',
  partial_invoice: 'Teilrechnung',
  final_invoice:   'Schlussrechnung',
  correction:      'Korrektur',
  credit_note:     'Gutschrift',
};

const BACKOFFICE_USERS = ['Anna', 'Birgit', 'Christine', 'Maria'];

// Der nächste sinnvolle Schritt pro Status — das macht dem PM klar was zu tun ist
const NEXT_ACTION = {
  draft:                { label: '✓ Bereit melden',        nextStatus: 'ready_for_backoffice', variant: 'default',  color: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  ready_for_backoffice: { label: '📤 An Backoffice senden', nextStatus: 'sent_to_backoffice',  variant: 'outline', color: 'border-blue-400 text-blue-700 hover:bg-blue-50' },
  sent_to_backoffice:   { label: '✓ Rechnung bestätigen',  nextStatus: 'invoice_created',     variant: 'outline', color: 'border-purple-400 text-purple-700 hover:bg-purple-50' },
  invoice_created:      null,
  paid:                 null,
  blocked:              { label: '✓ Bereit melden',        nextStatus: 'ready_for_backoffice', variant: 'default',  color: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  cancelled:            null,
};

function formatTimestamp(ts) {
  if (!ts) return null;
  try { return format(new Date(ts), 'dd.MM.yy HH:mm', { locale: de }); }
  catch { return null; }
}

function AuditLine({ instr }) {
  const lines = [];
  if (instr.created_date) lines.push({ label: 'Erstellt', ts: instr.created_date, icon: '📝' });
  if (instr.sent_to_backoffice_at) lines.push({ label: 'Gesendet', ts: instr.sent_to_backoffice_at, icon: '📤' });
  if (instr.invoice_created_at) lines.push({ label: 'Rechnung', ts: instr.invoice_created_at, icon: '🧾' });
  if (!lines.length) return null;
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
      {lines.map((l, i) => (
        <span key={i} className="flex items-center gap-1">
          <span>{l.icon}</span>
          <span className="font-medium">{l.label}:</span>
          <span>{formatTimestamp(l.ts)}</span>
        </span>
      ))}
    </div>
  );
}

export default function BillingInstructionList({ instructions, projectBlocks, onUpdate, onDelete, onDuplicate }) {
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [creatingDraft, setCreatingDraft] = useState(null);
  const [editingInstr, setEditingInstr] = useState(null);
  const [advancingId, setAdvancingId] = useState(null);

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

  async function handleAdvance(instr, nextStatus) {
    setAdvancingId(instr.id);
    const extra = {};
    if (nextStatus === 'sent_to_backoffice') extra.sent_to_backoffice_at = new Date().toISOString();
    if (nextStatus === 'invoice_created') extra.invoice_created_at = new Date().toISOString();
    try {
      await onUpdate(instr.id, { status: nextStatus, ...extra });
      const label = STATUS_CFG[nextStatus]?.label || nextStatus;
      toast.success(`Status geändert: ${label}`, {
        description: `${instr.customer_name || ''} · ${formatCurrency(instr.instruction_amount_net)} netto`
      });
    } catch (e) {
      toast.error('Statusänderung fehlgeschlagen', { description: e.message });
    } finally {
      setAdvancingId(null);
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
    <>
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Abrechnungsanweisungen ({instructions.length})</p>
      {instructions.map(instr => {
        const sc = STATUS_CFG[instr.status] || STATUS_CFG.draft;
        const StatusIcon = sc.icon;
        const linkedBlock = projectBlocks.find(b => b.id === instr.billing_block_id);
        const isExpanded = expandedId === instr.id;
        const nextAction = NEXT_ACTION[instr.status] || null;
        const isAdvancing = advancingId === instr.id;

        return (
          <div key={instr.id} className="border rounded-xl hover:shadow-sm transition-shadow bg-card">
            {/* ── Hauptzeile ── */}
            <div className="p-3 flex flex-col md:flex-row md:items-center gap-2">
              {/* Status-Icon + Badge */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusIcon className={`w-4 h-4 flex-shrink-0 ${
                  instr.status === 'sent_to_backoffice' ? 'text-blue-500' :
                  instr.status === 'invoice_created' ? 'text-purple-500' :
                  instr.status === 'paid' ? 'text-teal-500' :
                  instr.status === 'ready_for_backoffice' ? 'text-emerald-500' :
                  instr.status === 'blocked' ? 'text-red-500' : 'text-gray-400'
                }`} />
                <Badge className={`text-xs flex-shrink-0 ${sc.color}`}>{sc.label}</Badge>
              </div>

              {/* Info-Bereich */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{formatCurrency(instr.instruction_amount_net)}</span>
                  <span className="text-xs text-muted-foreground">netto</span>
                  <Badge variant="outline" className="text-xs">{INVOICE_TYPE_LABELS[instr.invoice_type] || '—'}</Badge>
                  {instr.additional_billing_percent > 0 && (
                    <span className="text-xs text-muted-foreground">+{Math.round(instr.additional_billing_percent)}% → {Math.round(instr.new_billing_percent || 0)}%</span>
                  )}
                  {instr.planned_invoice_date && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />{instr.planned_invoice_date}
                    </span>
                  )}
                </div>
                {instr.invoice_reason && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{instr.invoice_reason}</p>
                )}
                <AuditLine instr={instr} />
              </div>

              {/* Aktionen */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Primärer Nächster-Schritt-Button — sichtbar ohne expand */}
                {nextAction && (
                  <Button
                    size="sm"
                    className={`h-7 text-xs font-medium ${nextAction.color}`}
                    disabled={isAdvancing}
                    onClick={() => handleAdvance(instr, nextAction.nextStatus)}
                  >
                    {isAdvancing ? <Loader2 className="w-3 h-3 animate-spin" /> : nextAction.label}
                  </Button>
                )}

                {/* sevDesk */}
                {(instr.status === 'ready_for_backoffice' || instr.status === 'sent_to_backoffice' || instr.sevdesk_invoice_id) && (
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
                      ? <><Loader2 className="w-3 h-3 animate-spin" /></>
                      : instr.sevdesk_invoice_id
                        ? <><ExternalLink className="w-3 h-3" /></>
                        : <><FileText className="w-3 h-3" /></>
                    }
                  </Button>
                )}

                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditingInstr(instr)} title="Bearbeiten">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>

                {['draft', 'blocked', 'cancelled'].includes(instr.status) ? (
                  confirmDelete === instr.id ? (
                    <>
                      <span className="text-xs text-destructive font-medium whitespace-nowrap">Löschen?</span>
                      <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { onDelete(instr.id); setConfirmDelete(null); }}>Ja</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmDelete(null)}>Nein</Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      title="Anweisung löschen"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(instr.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )
                ) : (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground cursor-not-allowed opacity-30"
                    title={`Löschen nicht möglich: Status ist „${STATUS_CFG[instr.status]?.label || instr.status}"`}
                    disabled>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}

                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedId(isExpanded ? null : instr.id)}>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            {/* ── Aufgeklappt ── */}
            {isExpanded && (
              <div className="px-3 pb-3 pt-0 border-t bg-muted/20 rounded-b-xl space-y-3">
                {/* Status-Verlauf visuell */}
                <div className="flex items-center gap-1 pt-3 text-xs overflow-x-auto pb-1">
                  {Object.entries(STATUS_CFG).filter(([k]) => !['cancelled'].includes(k)).map(([key, cfg], idx, arr) => {
                    const order = ['draft','ready_for_backoffice','sent_to_backoffice','invoice_created','paid','blocked'];
                    const currentIdx = order.indexOf(instr.status);
                    const thisIdx = order.indexOf(key);
                    const isPast = thisIdx < currentIdx;
                    const isCurrent = key === instr.status;
                    const Icon = cfg.icon;
                    return (
                      <React.Fragment key={key}>
                        <div className={`flex flex-col items-center gap-0.5 flex-shrink-0 ${isCurrent ? 'opacity-100' : isPast ? 'opacity-70' : 'opacity-30'}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            isCurrent ? 'bg-primary text-primary-foreground' :
                            isPast ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                          }`}>
                            <Icon className="w-3 h-3" />
                          </div>
                          <span className={`text-[10px] text-center leading-tight max-w-[60px] ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                            {cfg.label}
                          </span>
                        </div>
                        {idx < arr.filter(([k]) => !['cancelled'].includes(k)).length - 1 && (
                          <div className={`flex-1 h-px min-w-[12px] ${thisIdx < currentIdx ? 'bg-emerald-300' : 'bg-muted'}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Detaildaten */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
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
                {instr.backoffice_note && (
                  <div className="p-2 rounded-lg bg-purple-50 border border-purple-200">
                    <p className="text-xs text-purple-700 font-medium">💬 Rückmeldung Backoffice</p>
                    <p className="text-xs mt-0.5 text-purple-800">{instr.backoffice_note}</p>
                  </div>
                )}

                {/* Links & Sekundäraktionen */}
                <div className="flex items-center gap-2 pt-1 flex-wrap border-t">
                  {instr.sevdesk_invoice_id && (
                    <a href={instr.sevdesk_invoice_url || `https://my.sevdesk.de/#/fi/${instr.sevdesk_invoice_id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> In sevDesk öffnen
                    </a>
                  )}
                  {!instr.sevdesk_invoice_id && (instr.status === 'ready_for_backoffice' || instr.status === 'sent_to_backoffice') && (
                    <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                      disabled={creatingDraft === instr.id}
                      onClick={() => handleCreateSevdeskDraft(instr.id)}>
                      {creatingDraft === instr.id
                        ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Wird angelegt…</>
                        : <><FileText className="w-3 h-3 mr-1" /> Rechnungsentwurf erzeugen</>
                      }
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onDuplicate(instr)}>
                    <Copy className="w-3 h-3 mr-1" /> Duplizieren
                  </Button>
                  {['draft', 'blocked', 'cancelled'].includes(instr.status) ? (
                    confirmDelete === `expanded-${instr.id}` ? (
                      <>
                        <span className="text-xs text-destructive">Wirklich löschen? Verknüpfung im Verrechnungsplan wird aufgehoben.</span>
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { onDelete(instr.id); setConfirmDelete(null); }}>Ja, löschen</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmDelete(null)}>Abbrechen</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                        onClick={() => setConfirmDelete(`expanded-${instr.id}`)}>
                        <Trash2 className="w-3 h-3 mr-1" /> Löschen
                      </Button>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      Löschen gesperrt (Status: {STATUS_CFG[instr.status]?.label || instr.status})
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
    <BillingInstructionEditDialog
      instruction={editingInstr}
      open={!!editingInstr}
      onClose={() => setEditingInstr(null)}
      onSave={async (id, data) => { await onUpdate(id, data); }}
    />
    </>
  );
}