import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, ShieldCheck, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/liquidityUtils';
import { checkReceivableInvoiceConsistency, calculateInvoiceOpenAmount } from '@/lib/paymentDataUtils';

const SEVERITY_CONFIG = {
  high:   { color: 'bg-red-100 text-red-700 border-red-200',    icon: AlertTriangle, label: 'Hoch' },
  medium: { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertTriangle, label: 'Mittel' },
  info:   { color: 'bg-blue-100 text-blue-700 border-blue-200',  icon: Info,          label: 'Info' },
};

const TYPE_LABELS = {
  paid_invoice_open_receivable:    'Bezahlt, aber Forderung offen',
  partial_payment_not_reflected:   'Teilzahlung nicht in Forderung',
  amount_mismatch:                 'Betragsdifferenz',
  invoice_without_receivable:      'Rechnung ohne Forderung',
  receivable_without_invoice:      'Forderung ohne Rechnung',
};

export default function PaymentConsistencyCheck() {
  const queryClient = useQueryClient();
  const [issues, setIssues] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [confirming, setConfirming] = useState(null); // issue index awaiting confirmation
  const [ignoredIds, setIgnoredIds] = useState(new Set());
  const [reviewedIds, setReviewedIds] = useState(new Set());

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });
  const { data: receivables = [], isLoading: receivablesLoading } = useQuery({
    queryKey: ['receivables'], queryFn: () => base44.entities.Receivable.list()
  });

  const isLoading = invoicesLoading || receivablesLoading;

  const updateReceivableMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Receivable.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      setConfirming(null);
    }
  });

  const createAuditLogMutation = useMutation({
    mutationFn: (data) => base44.entities.AuditLog.create(data),
  });

  const handleRunCheck = () => {
    setIsChecking(true);
    setIssues(null);
    setTimeout(() => {
      const result = checkReceivableInvoiceConsistency(invoices, receivables);
      setIssues(result);
      setIsChecking(false);
    }, 100);
  };

  const handleApplyFix = async (issue) => {
    if (!issue.receivable) return;
    const newStatus = issue.invoice?.payment_status === 'paid' ? 'paid'
      : issue.invoice?.payment_status === 'partially_paid' ? 'partially_paid'
      : issue.receivable.status;

    const calc = issue.invoice ? calculateInvoiceOpenAmount(issue.invoice) : null;

    await updateReceivableMutation.mutateAsync({
      id: issue.receivable.id,
      data: {
        status: newStatus,
        ...(calc ? { gross_amount: calc.gross } : {}),
      }
    });

    await createAuditLogMutation.mutateAsync({
      action: 'update',
      entity_type: 'Receivable',
      entity_id: issue.receivable.id,
      details: `Konsistenzprüfung: Status aktualisiert von "${issue.receivable.status}" auf "${newStatus}". Quelle: InvoiceRecord ${issue.invoice?.invoice_number || '—'}.`,
    });

    // Re-run check
    const updated = receivables.map(r => r.id === issue.receivable.id ? { ...r, status: newStatus } : r);
    setIssues(checkReceivableInvoiceConsistency(invoices, updated));
    setConfirming(null);
  };

  const visibleIssues = issues?.filter((_issue, i) => !ignoredIds.has(i)) || [];
  const highCount = visibleIssues.filter(i => i.severity === 'high').length;
  const mediumCount = visibleIssues.filter(i => i.severity === 'medium').length;
  const infoCount = visibleIssues.filter(i => i.severity === 'info').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zahlungs-Konsistenzprüfung"
        subtitle="InvoiceRecord vs. Forderungen — Abweichungen erkennen"
        icon={ShieldCheck}
        actions={
          <Button onClick={handleRunCheck} disabled={isChecking || isLoading}>
            {isChecking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Forderungen mit Rechnungen prüfen
          </Button>
        }
      />

      {/* Info box */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Lesender Abgleich — keine Daten werden automatisch überschrieben</p>
          <p className="text-xs mt-0.5">
            Diese Prüfung vergleicht InvoiceRecord-Zahlungsstatus mit Receivable-Datensätzen.
            Korrekturen müssen pro Zeile manuell bestätigt werden. Jede Änderung wird im AuditLog protokolliert.
          </p>
        </div>
      </div>

      {isLoading && <Skeleton className="h-40" />}

      {!isLoading && issues === null && (
        <Card>
          <CardContent className="pt-6 text-center py-12 text-muted-foreground">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">Noch keine Prüfung gestartet</p>
            <p className="text-sm mt-1">Klicke auf "Forderungen mit Rechnungen prüfen" um zu beginnen.</p>
          </CardContent>
        </Card>
      )}

      {issues !== null && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Gefundene Probleme</p>
              <p className="text-2xl font-bold mt-1">{visibleIssues.length}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-red-600">Hohe Priorität</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{highCount}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-amber-600">Mittlere Priorität</p>
              <p className="text-2xl font-bold mt-1 text-amber-600">{mediumCount}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-blue-600">Informativ</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{infoCount}</p>
            </CardContent></Card>
          </div>

          {visibleIssues.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
                <p className="font-semibold text-emerald-700">Keine Abweichungen gefunden</p>
                <p className="text-sm text-muted-foreground mt-1">InvoiceRecords und Forderungen sind konsistent.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Abweichungen ({visibleIssues.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left pb-2 font-medium">Problem</th>
                        <th className="text-left pb-2 font-medium">Rechnung</th>
                        <th className="text-left pb-2 font-medium">Kunde</th>
                        <th className="text-left pb-2 font-medium">IR-Status</th>
                        <th className="text-right pb-2 font-medium">IR Berechnet offen</th>
                        <th className="text-left pb-2 font-medium">Forderung-Status</th>
                        <th className="text-right pb-2 font-medium">Forderung Betrag</th>
                        <th className="text-left pb-2 font-medium">Priorität</th>
                        <th className="text-left pb-2 font-medium">Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleIssues.map((issue, i) => {
                        const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info;
                        const SevIcon = sev.icon;
                        const calc = issue.invoice ? calculateInvoiceOpenAmount(issue.invoice) : null;
                        const isReviewed = reviewedIds.has(i);
                        return (
                          <tr key={i} className={`border-b last:border-0 ${isReviewed ? 'opacity-50' : 'hover:bg-muted/30'}`}>
                            <td className="py-2 pr-3">
                              <div className="flex items-start gap-1.5">
                                <SevIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-current" />
                                <span className="text-xs leading-snug">{TYPE_LABELS[issue.type] || issue.type}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{issue.message}</p>
                            </td>
                            <td className="py-2 text-xs font-medium">{issue.invoice?.invoice_number || '—'}</td>
                            <td className="py-2 text-xs">{issue.invoice?.customer_name || issue.receivable?.customer || '—'}</td>
                            <td className="py-2">
                              {issue.invoice ? (
                                <Badge className="text-xs">{issue.invoice.payment_status}</Badge>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="py-2 text-right text-xs">
                              {calc ? formatCurrency(calc.calculated_open) : '—'}
                            </td>
                            <td className="py-2">
                              {issue.receivable ? (
                                <Badge className="text-xs">{issue.receivable.status}</Badge>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="py-2 text-right text-xs">
                              {issue.receivable ? formatCurrency(issue.receivable.gross_amount) : '—'}
                            </td>
                            <td className="py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${sev.color}`}>
                                {sev.label}
                              </span>
                            </td>
                            <td className="py-2">
                              <div className="flex gap-1 flex-wrap">
                                {issue.receivable && issue.invoice && issue.severity !== 'info' && (
                                  confirming === i ? (
                                    <div className="flex gap-1">
                                      <Button size="sm" className="h-6 text-xs bg-emerald-600 hover:bg-emerald-700"
                                        disabled={updateReceivableMutation.isPending}
                                        onClick={() => handleApplyFix(issue)}>
                                        {updateReceivableMutation.isPending ? '...' : '✓ Bestätigen'}
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-6 text-xs"
                                        onClick={() => setConfirming(null)}>
                                        Abbrechen
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button size="sm" variant="outline" className="h-6 text-xs"
                                      onClick={() => setConfirming(i)}>
                                      Übernehmen
                                    </Button>
                                  )
                                )}
                                <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground"
                                  onClick={() => {
                                    if (isReviewed) {
                                      setReviewedIds(s => { const n = new Set(s); n.delete(i); return n; });
                                    } else {
                                      setReviewedIds(s => new Set([...s, i]));
                                    }
                                  }}>
                                  {isReviewed ? 'Zurücksetzen' : 'Als geprüft markieren'}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400"
                                  onClick={() => setIgnoredIds(s => new Set([...s, i]))}>
                                  Ignorieren
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}