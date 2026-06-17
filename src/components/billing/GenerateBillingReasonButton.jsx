import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';

/**
 * KI-Button zum Generieren eines Abrechnungsgrundes.
 * Ruft die Backend-Funktion generateBillingReason auf und gibt
 * den generierten Text via onResult zurück.
 */
export default function GenerateBillingReasonButton({
  project,
  confirmedOrderId,
  plannedAmountNet,
  plannedPercent,
  plannedInvoiceType,
  planningMonth,
  onResult,
  disabled,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    const res = await base44.functions.invoke('generateBillingReason', {
      project_id: project?.id,
      confirmed_order_id: confirmedOrderId || '',
      planned_amount_net: plannedAmountNet || 0,
      planned_percent: plannedPercent || 0,
      planned_invoice_type: plannedInvoiceType || 'TR',
      planning_month: planningMonth || '',
    });
    setLoading(false);
    if (res?.data?.invoice_reason) {
      onResult(res.data.invoice_reason);
    } else {
      setError('KI konnte keinen Text generieren.');
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
        onClick={handleGenerate}
        disabled={loading || disabled}
        title="KI generiert Abrechnungsgrund aus awork-Daten, Auftragsbestätigung und Abrechnungshistorie"
      >
        {loading
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Sparkles className="w-3 h-3" />}
        {loading ? 'KI denkt…' : 'KI-Grund generieren'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}