import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

const PLAN_STATUS_LABELS = {
  open: 'offen', planned: 'geplant', in_review: 'in Prüfung',
  ready_for_invoice: 'bereit', sent_to_backoffice: 'in Verrechnung',
  invoiced: 'verrechnet', postponed: 'verschoben', on_hold: 'on hold',
};
const INSTR_STATUS_LABELS = {
  draft: 'Entwurf', ready_for_backoffice: 'Bereit', sent_to_backoffice: 'Gesendet',
  invoice_created: 'Rechnung erstellt', paid: 'Bezahlt',
};
const INSTR_TYPE_LABELS = {
  advance_invoice: 'Anzahlung', partial_invoice: 'Teilrechnung',
  final_invoice: 'Schlussrechnung', correction: 'Korrektur', credit_note: 'Gutschrift',
};
const PLAN_TYPE_LABELS = { AZ: 'Anzahlung', TR: 'Teilrechnung', ER: 'Schlussrechnung' };

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v) => `<td style="mso-number-format:'#,##0.00'" align="right">${Number(v) || 0}</td>`;
const cell = (v) => `<td>${esc(v)}</td>`;

// Exportiert die Abrechnungsdaten EINES Monats (Anweisungen + Rechnungsplanung)
// als Excel-kompatible .xls-Datei.
export default function BillingMonthXlsExport({ monthStr, monthLabel, instructions, plans, projectsById, allInstructions }) {
  const handleExport = () => {
    const instrRows = instructions.map((i) => `<tr>${cell(i.customer_name)}${cell(i.project_name)}${cell(INSTR_TYPE_LABELS[i.invoice_type] || i.invoice_type)}${num(i.instruction_amount_net)}${num(i.instruction_amount_gross)}${cell(INSTR_STATUS_LABELS[i.status] || i.status)}${cell(i.planned_invoice_date)}${cell(i.invoice_instruction_text || i.invoice_reason)}</tr>`).join('');

    const planRows = plans.map((p) => {
      const proj = projectsById[p.project_id];
      const linked = p.linked_billing_instruction_id ? (allInstructions || []).find((i) => i.id === p.linked_billing_instruction_id) : null;
      return `<tr>${cell(proj?.customer || p.assigned_pm)}${cell(proj?.project_name)}${cell(PLAN_TYPE_LABELS[p.planned_invoice_type] || p.planned_invoice_type)}${num(p.planned_percent)}${num(p.planned_amount_net)}${num(p.planned_amount_gross)}${cell(PLAN_STATUS_LABELS[p.billing_status] || p.billing_status)}${cell(p.linked_billing_instruction_id ? 'ja' : 'nein')}${cell(linked?.planned_invoice_date)}${cell(p.invoice_reason || p.internal_note)}</tr>`;
    }).join('');

    const totalInstr = instructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);
    const totalPlans = plans.reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0);

    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>
<h2>Abrechnungsforecast ${esc(monthLabel)}</h2>
<h3>Abrechnungsanweisungen (${instructions.length}) — Summe netto: ${totalInstr.toFixed(2)}</h3>
<table border="1"><tr><th>Kunde</th><th>Projekt</th><th>Typ</th><th>Netto</th><th>Brutto</th><th>Status</th><th>Datum</th><th>Anweisungstext</th></tr>${instrRows}</table>
<br/>
<h3>Rechnungsplanung (${plans.length}) — Summe netto: ${totalPlans.toFixed(2)}</h3>
<table border="1"><tr><th>Kunde</th><th>Projekt</th><th>Typ</th><th>%</th><th>Netto</th><th>Brutto</th><th>Status</th><th>Anweisung erstellt</th><th>Anweisungsdatum</th><th>Grund</th></tr>${planRows}</table>
</body></html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Abrechnungsforecast_${monthStr}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleExport}>
      <Download className="w-3.5 h-3.5" /> XLS-Export
    </Button>
  );
}