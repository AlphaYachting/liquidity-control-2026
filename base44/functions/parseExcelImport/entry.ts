import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as XLSX from 'npm:xlsx@0.18.5';
import { assertSafeFileUrl } from '../../shared/safeFileUrl.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, sheet_index = 0 } = await req.json();
    if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });

    // Fetch the file (URL serverseitig validiert — SSRF-Schutz)
    let safeUrl: string;
    try {
      safeUrl = assertSafeFileUrl(file_url);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    const fileResp = await fetch(safeUrl);
    if (!fileResp.ok) return Response.json({ error: `Cannot fetch file: ${fileResp.status}` }, { status: 400 });

    const arrayBuffer = await fileResp.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: true });

    const sheetNames = workbook.SheetNames;
    const targetSheet = sheetNames[sheet_index] || sheetNames[0];
    const sheet = workbook.Sheets[targetSheet];

    // Convert to array of arrays (raw rows)
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rawData.length < 2) {
      return Response.json({ error: 'Sheet hat weniger als 2 Zeilen — kein verwertbarer Inhalt' }, { status: 400 });
    }

    // Find header row: first row with >= 3 non-null cells
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const nonNull = (rawData[i] || []).filter(c => c !== null && c !== '').length;
      if (nonNull >= 3) { headerRowIdx = i; break; }
    }

    const headers = (rawData[headerRowIdx] || []).map(h => (h !== null && h !== undefined) ? String(h).trim() : '');
    const dataRows = rawData.slice(headerRowIdx + 1).filter(row =>
      (row || []).some(cell => cell !== null && cell !== '' && cell !== undefined)
    );

    // Basic column mapping heuristic (same patterns as frontend lib)
    const COLUMN_PATTERNS = [
      { field: 'customer_name_raw', patterns: ['kunde', 'customer', 'auftraggeber', 'klient', 'firma'] },
      { field: 'project_name_raw', patterns: ['projekt', 'project', 'bezeichnung', 'titel', 'name', 'auftrag'] },
      { field: 'project_manager', patterns: ['pm', 'projektleiter', 'project manager', 'verantwortlich', 'betreuer'] },
      { field: 'project_status', patterns: ['status', 'projektstatus', 'zustand', 'phase'] },
      { field: 'billing_status', patterns: ['verrechnung', 'rechnungsstatus', 'abrechnungsstatus', 'billing'] },
      { field: 'total_order_amount_net', patterns: ['auftragssumme', 'gesamtbetrag', 'netto gesamt', 'auftragsvolumen', 'betrag gesamt', 'summe netto', 'total'] },
      { field: 'already_invoiced_net', patterns: ['verrechnet', 'bereits verrechnet', 'fakturiert', 'invoiced'] },
      { field: 'already_invoiced_percent', patterns: ['verrechnet %', 'fakturiert %', '% verrechnet'] },
      { field: 'open_amount_net', patterns: ['offen', 'offener betrag', 'restbetrag', 'noch zu verrechnen', 'open amount'] },
      { field: 'open_percent', patterns: ['offen %', '% offen', 'rest %'] },
      { field: 'expected_current_month_amount_net', patterns: ['aktueller monat', 'laufender monat', 'current month'] },
      { field: 'expected_next_month_amount_net', patterns: ['nächster monat', 'next month', 'folgemonat'] },
      { field: 'risk_status', patterns: ['risiko', 'risk', 'priorität'] },
      { field: 'notes', patterns: ['anmerkung', 'notiz', 'kommentar', 'note', 'bemerkung', 'info'] },
      { field: 'next_invoice_note', patterns: ['nächste rechnung', 'next invoice', 'abrechnungshinweis'] },
    ];

    const columnMapping = {};
    const usedFields = new Set();
    headers.forEach((header, idx) => {
      const h = header.toLowerCase();
      for (const { field, patterns } of COLUMN_PATTERNS) {
        if (usedFields.has(field)) continue;
        if (patterns.some(p => h.includes(p) || p.includes(h))) {
          columnMapping[idx] = { field, confidence: 0.85, header };
          usedFields.add(field);
          break;
        }
      }
      if (!columnMapping[idx]) {
        columnMapping[idx] = { field: null, confidence: 0, header };
      }
    });

    // Parse rows using the mapping
    const parsedRows = dataRows.map((row, i) => {
      const mapped = { row_number: i + 1 };
      headers.forEach((_, colIdx) => {
        const { field } = columnMapping[colIdx] || {};
        if (!field) return;
        const val = row[colIdx];
        if (val === null || val === undefined || val === '') return;
        const numericFields = [
          'total_order_amount_net', 'already_invoiced_net', 'already_invoiced_percent',
          'open_amount_net', 'open_percent', 'expected_current_month_amount_net',
          'expected_current_month_percent', 'expected_next_month_amount_net', 'expected_next_month_percent'
        ];
        if (numericFields.includes(field)) {
          const n = parseFloat(String(val).replace(/[€$,\s]/g, '').replace(',', '.'));
          mapped[field] = isNaN(n) ? 0 : n;
        } else {
          mapped[field] = String(val).trim();
        }
      });
      return mapped;
    }).filter(r => r.customer_name_raw || r.project_name_raw);

    return Response.json({
      sheet_names: sheetNames,
      target_sheet: targetSheet,
      header_row_index: headerRowIdx,
      headers,
      column_mapping: columnMapping,
      total_rows: parsedRows.length,
      parsed_rows: parsedRows,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});