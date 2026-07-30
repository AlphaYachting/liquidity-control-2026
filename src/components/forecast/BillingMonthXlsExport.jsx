import React from 'react';
import * as XLSX from 'xlsx';
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

// Exportiert die Abrechnungsdaten EINES Monats (Anweisungen + Rechnungsplanung)
// als modernes Excel-Workbook (.xlsx) mit zwei Arbeitsblättern.
export default function BillingMonthXlsExport({ monthStr, monthLabel, instructions, plans, projectsById, allInstructions }) {
  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    const instrRows = instructions.map((i) => ({
      'Kunde': i.customer_name || '',
      'Projekt': i.project_name || '',
      'Typ': INSTR_TYPE_LABELS[i.invoice_type] || i.invoice_type || '',
      'Netto': Number(i.instruction_amount_net) || 0,
      'Brutto': Number(i.instruction_amount_gross) || 0,
      'Status': INSTR_STATUS_LABELS[i.status] || i.status || '',
      'Datum': i.planned_invoice_date || '',
      'Anweisungstext': i.invoice_instruction_text || i.invoice_reason || '',
    }));
    instrRows.push({
      'Kunde': 'SUMME', 'Projekt': '', 'Typ': '',
      'Netto': instructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0),
      'Brutto': instructions.reduce((s, i) => s + (Number(i.instruction_amount_gross) || 0), 0),
      'Status': '', 'Datum': '', 'Anweisungstext': '',
    });

    const planRows = plans.map((p) => {
      const proj = projectsById[p.project_id];
      const linked = p.linked_billing_instruction_id ? (allInstructions || []).find((i) => i.id === p.linked_billing_instruction_id) : null;
      return {
        'Kunde': proj?.customer || p.assigned_pm || '',
        'Projekt': proj?.project_name || '',
        'Typ': PLAN_TYPE_LABELS[p.planned_invoice_type] || p.planned_invoice_type || '',
        '%': Number(p.planned_percent) || 0,
        'Netto': Number(p.planned_amount_net) || 0,
        'Brutto': Number(p.planned_amount_gross) || 0,
        'Status': PLAN_STATUS_LABELS[p.billing_status] || p.billing_status || '',
        'Anweisung erstellt': p.linked_billing_instruction_id ? 'ja' : 'nein',
        'Anweisungsdatum': linked?.planned_invoice_date || '',
        'Grund': p.invoice_reason || p.internal_note || '',
      };
    });
    planRows.push({
      'Kunde': 'SUMME', 'Projekt': '', 'Typ': '', '%': '',
      'Netto': plans.reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0),
      'Brutto': plans.reduce((s, p) => s + (Number(p.planned_amount_gross) || 0), 0),
      'Status': '', 'Anweisung erstellt': '', 'Anweisungsdatum': '', 'Grund': '',
    });

    const wsInstr = XLSX.utils.json_to_sheet(instrRows);
    wsInstr['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 50 }];
    const wsPlans = XLSX.utils.json_to_sheet(planRows);
    wsPlans['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 50 }];

    XLSX.utils.book_append_sheet(wb, wsInstr, 'Anweisungen');
    XLSX.utils.book_append_sheet(wb, wsPlans, 'Rechnungsplanung');
    XLSX.writeFile(wb, `Abrechnungsforecast_${monthStr}.xlsx`);
  };

  return (
    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleExport}>
      <Download className="w-3.5 h-3.5" /> Excel-Export
    </Button>
  );
}