import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Upload, AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusBadge from '@/components/shared/StatusBadge';
import PaymentSourceBadge from '@/components/shared/PaymentSourceBadge';
import PaymentFreshnessWarning from '@/components/shared/PaymentFreshnessWarning';
import InvoiceRecordForm from '@/components/orders/InvoiceRecordForm';
import InvoiceScanUploader from '@/components/orders/InvoiceScanUploader';
import { formatCurrency } from '@/lib/liquidityUtils';
import { getEffectivePaid } from '@/lib/projectFinancials';

export default function ProjectInvoiceSection({
  projectId,
  projectBlocks,
  linkedOrders,
  projectInvoices,
  likelyUnmatchedInvoices,
  adjustedInvoicedNet,
  totalPaidGross,
  openReceivableGross,
  customerName,
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false); // 'manual' | 'scan' | null
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [prefillBlockId, setPrefillBlockId] = useState(null);

  const primaryOrder = linkedOrders[0] || null;

  const saveInvoiceMutation = useMutation({
    mutationFn: ({ id, data }) => id
      ? base44.entities.InvoiceRecord.update(id, data)
      : base44.entities.InvoiceRecord.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceRecords'] });
      setShowForm(false);
      setEditingInvoice(null);
      setPrefillBlockId(null);
    }
  });

  const handleNewInvoice = (blockId = null) => {
    setPrefillBlockId(blockId);
    setEditingInvoice(null);
    setShowForm('manual');
  };

  const handleEdit = (inv) => {
    setEditingInvoice(inv);
    setPrefillBlockId(null);
    setShowForm('manual');
  };

  // Build prefill for invoice form
  const buildPrefill = () => {
    const block = prefillBlockId ? projectBlocks.find(b => b.id === prefillBlockId) : null;
    return {
      project_id: projectId,
      confirmed_order_id: block?.confirmed_order_id || primaryOrder?.id || '',
      billing_block_id: block?.id || '',
      customer_name: customerName || block?.customer || primaryOrder?.customer || '',
      net_amount: block?.planned_invoice_amount || block?.amount_net || '',
      invoice_type: block?.invoice_type || 'partial_invoice',
    };
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Rechnungen & Zahlungsstatus ({projectInvoices.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
              onClick={() => { setShowForm('scan'); setEditingInvoice(null); }}>
              <Upload className="w-3 h-3" /> Scannen
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1"
              onClick={() => handleNewInvoice()}>
              <Plus className="w-3 h-3" /> Rechnung erfassen
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PaymentFreshnessWarning invoiceRecords={projectInvoices} />

        {/* Manual form */}
        {showForm === 'manual' && (
          <div className="p-4 border rounded-xl bg-muted/30">
            <InvoiceRecordForm
              invoice={editingInvoice || buildPrefill()}
              confirmedOrderId={primaryOrder?.id}
              billingBlocks={projectBlocks}
              onSave={(data) => saveInvoiceMutation.mutate({
                id: editingInvoice?.id,
                data: { ...data, project_id: projectId }
              })}
              onCancel={() => { setShowForm(false); setEditingInvoice(null); setPrefillBlockId(null); }}
              isSaving={saveInvoiceMutation.isPending}
            />
          </div>
        )}

        {/* Scan uploader */}
        {showForm === 'scan' && (
          <div className="p-4 border rounded-xl bg-muted/30">
            <InvoiceScanUploader
              confirmedOrderId={primaryOrder?.id}
              customerName={customerName}
              billingBlocks={projectBlocks}
              onSaved={() => { queryClient.invalidateQueries({ queryKey: ['invoiceRecords'] }); setShowForm(false); }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Invoice table */}
        {projectInvoices.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground text-center py-6">Keine Rechnungen verknüpft</p>
        ) : projectInvoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left pb-2 font-medium">Rechnung</th>
                  <th className="text-right pb-2 font-medium">Netto</th>
                  <th className="text-right pb-2 font-medium">Bezahlt brutto</th>
                  <th className="text-right pb-2 font-medium">Offen</th>
                  <th className="text-left pb-2 font-medium pl-2">Status</th>
                  <th className="text-left pb-2 font-medium pl-2">Quelle</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {projectInvoices.map(inv => {
                  const ep = getEffectivePaid(inv);
                  const openAmt = Math.max(0, (Number(inv.gross_amount) || 0) - ep.amount);
                  const fileUrl = inv.source_file;
                  const sevdeskUrl = inv.sevdesk_id
                    ? `https://my.sevdesk.de/#/fi/edit/type/RE/id/${inv.sevdesk_id}`
                    : inv.sevdesk_invoice_url || null;
                  const hasLink = fileUrl || sevdeskUrl;
                  return (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          {hasLink ? (
                            sevdeskUrl ? (
                              <a href={sevdeskUrl} target="_blank" rel="noopener noreferrer"
                                className="font-medium text-primary hover:underline flex items-center gap-1" title="In sevDesk öffnen">
                                {inv.invoice_number || '—'}
                                <ExternalLink className="w-3 h-3 opacity-60" />
                              </a>
                            ) : (
                              <button onClick={() => {/* handled via existing PDF viewer in parent */}}
                                className="font-medium text-primary hover:underline flex items-center gap-1" title="Dokument öffnen">
                                {inv.invoice_number || '—'}
                                <FileText className="w-3 h-3 opacity-60" />
                              </button>
                            )
                          ) : (
                            <span className="font-medium">{inv.invoice_number || '—'}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground">{inv.invoice_date || ''}</p>
                          {inv.invoice_type && (
                            <span className="text-xs bg-slate-100 text-slate-600 rounded px-1">
                              {inv.invoice_type === 'advance_invoice' ? 'AZ' : inv.invoice_type === 'partial_invoice' ? 'TR' : inv.invoice_type === 'final_invoice' ? 'ER' : inv.invoice_type === 'credit_note' ? 'GS' : inv.invoice_type === 'correction' ? 'KO' : inv.invoice_type}
                            </span>
                          )}
                          {inv.is_credit_note && <Badge className="text-xs bg-purple-100 text-purple-700">Gutschrift</Badge>}
                        </div>
                      </td>
                      <td className="py-2 text-right font-semibold">{formatCurrency(inv.net_amount)}</td>
                      <td className="py-2 text-right text-emerald-600">{formatCurrency(ep.amount)}</td>
                      <td className="py-2 text-right text-amber-600">{formatCurrency(openAmt)}</td>
                      <td className="py-2 pl-2"><StatusBadge status={inv.payment_status} /></td>
                      <td className="py-2 pl-2">
                        <PaymentSourceBadge
                          sourceType={inv.source_type}
                          sourceFile={inv.source_file}
                          updatedDate={inv.updated_date}
                          showDate
                        />
                      </td>
                      <td className="py-2 pl-2">
                        <Button variant="ghost" size="sm" className="h-6 text-xs"
                          onClick={() => handleEdit(inv)}>
                          Bearb.
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20">
                  <td className="py-2 text-sm font-semibold">Summe</td>
                  <td className="py-2 text-right font-bold">{formatCurrency(adjustedInvoicedNet)}</td>
                  <td className="py-2 text-right font-bold text-emerald-600">{formatCurrency(totalPaidGross)}</td>
                  <td className="py-2 text-right font-bold text-amber-600">{formatCurrency(openReceivableGross)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}

        {/* Unmatched invoices */}
        {likelyUnmatchedInvoices.length > 0 && (
          <div className="border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Möglicherweise zugehörig — bitte prüfen ({likelyUnmatchedInvoices.length})
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Gleicher Kundenname, keine AB/Projektzuordnung. Fließen <strong>nicht</strong> in Projektsummen ein.
            </p>
            <div className="space-y-1">
              {likelyUnmatchedInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                  <span className="font-medium">{inv.invoice_number || '—'} · {inv.invoice_date || ''}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatCurrency(inv.net_amount)}</span>
                    <StatusBadge status={inv.payment_status} />
                    <Link to="/invoice-matching" className="text-primary hover:underline">Zuordnen →</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}