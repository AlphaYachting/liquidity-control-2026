import React from 'react';
import { getSourceConfig } from '@/lib/paymentDataUtils';

/**
 * Displays a source_type badge for an invoice/payment record.
 * Always shows something — "Quelle unbekannt" if source_type is missing.
 */
export default function PaymentSourceBadge({ sourceType, sourceFile, updatedDate, showDate = false }) {
  const cfg = getSourceConfig(sourceType);

  const dateStr = updatedDate
    ? new Date(updatedDate).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
        {cfg.live ? '🟢' : '📥'} {cfg.label}
      </span>
      {showDate && dateStr && (
        <span className="text-xs text-muted-foreground">Datenstand: {dateStr}</span>
      )}
      {sourceFile && (
        <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={sourceFile}>
          {sourceFile}
        </span>
      )}
    </div>
  );
}