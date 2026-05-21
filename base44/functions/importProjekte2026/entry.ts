import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as XLSX from 'npm:xlsx@0.18.5';

function cellVal(sheet, row, col) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return null;
  if (cell.t === 'n') return cell.v;
  if (cell.t === 's') return cell.v;
  if (cell.t === 'b') return cell.v;
  return cell.w || cell.v || null;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { file_url, dry_run } = body;
    if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });

    const fileResp = await fetch(file_url);
    const arrayBuffer = await fileResp.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });

    const sheetName = 'Projekte 2026';
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return Response.json({ error: `Sheet "${sheetName}" nicht gefunden.`, available: workbook.SheetNames }, { status: 400 });
    }

    const range = XLSX.utils.decode_range(sheet['!ref']);
    const maxRow = range.e.r;

    // Confirmed column mapping (from cell-level debug of row 7 = first data row):
    // c0 = ok-Marker (bool), c1 = ok-Marker (bool)
    // c2 = Projektstatus (z.B. "Läuft", "Abgeschlossen")
    // c3 = Kunde
    // c4 = Projekt
    // c5 = PM
    // c6 = Gesamtbetrag (number)
    // c7 = Anmerkungen / Zahlungsbedingungen (text)
    // c8 = Anmerkungen (text, z.B. "30% AZ, 20% TR") — NOT a number!
    // c9 = Offener Betrag (number)
    // c10 = Fremdkosten (number, often empty)
    // c11 = Auftragsnummer (text, may be empty)
    //
    // Monthly columns (each month = 6 cols: IST-Betrag, %-Gesamt, Datum, SOLL-Betrag, %-Gesamt, Datum):
    // Jan: IST=12, SOLL=15 | Feb: IST=18, SOLL=21 | Mär: IST=24, SOLL=27
    // Apr: IST=30, SOLL=33 | Mai: IST=36, SOLL=39 | Jun: IST=42, SOLL=45  (WAIT - need to re-check)
    // Actually from Row 4 header: col12=Ist, col15=Soll for Jan → 6 cols per month
    // Jan: 12-17, Feb: 18-23, Mär: 24-29, Apr: 30-35, Mai: 36-41, Jun: 42-47
    // Jul: 48-53, Aug: 54-59, Sep: 60-65, Okt: 66-71, Nov: 72-77, Dez: 78-83
    // BUT from row1 debug: SOLL is labeled at col15 (not 18) → so: IST=12, %-=13, Dat=14, SOLL=15, %-=16, Dat=17
    // Then Feb starts at 18: IST=18, SOLL=21, Mär: IST=24, SOLL=27 → spacing = 6 ✓

    const MONTH_COLS = [
      { month: '2026-01', ist: 12, soll: 15 },
      { month: '2026-02', ist: 18, soll: 21 },
      { month: '2026-03', ist: 24, soll: 27 },
      { month: '2026-04', ist: 30, soll: 33 },
      { month: '2026-05', ist: 36, soll: 39 },
      { month: '2026-06', ist: 42, soll: 45 },
      { month: '2026-07', ist: 48, soll: 51 },
      { month: '2026-08', ist: 54, soll: 57 },
      { month: '2026-09', ist: 60, soll: 63 },
      { month: '2026-10', ist: 66, soll: 69 },
      { month: '2026-11', ist: 72, soll: 75 },
      { month: '2026-12', ist: 78, soll: 81 },
    ];

    const batchId = `projekte2026_${Date.now()}`;
    const projects = [];
    const SKIP_VALUES = ['GESAMT', 'Projekt', 'wird fix verrechnet', 'wird evtl. verrechnet', 'Projektstatus'];

    // Data rows start at index 7 (0-indexed)
    for (let r = 7; r <= maxRow; r++) {
      const project_name = toStr(cellVal(sheet, r, 4));
      if (!project_name) continue;
      if (SKIP_VALUES.some(s => project_name.includes(s))) continue;
      if (project_name.startsWith('*')) continue;

      const status = toStr(cellVal(sheet, r, 2));
      if (status.toLowerCase().includes('projektstatus')) continue;

      const customer = toStr(cellVal(sheet, r, 3));
      const project_manager = toStr(cellVal(sheet, r, 5));
      const total_net_amount = toNum(cellVal(sheet, r, 6));
      const payment_notes = toStr(cellVal(sheet, r, 7)); // Zahlungsbedingungen text
      const notes = toStr(cellVal(sheet, r, 8)); // Anmerkungen
      const open_amount = toNum(cellVal(sheet, r, 9));
      const external_costs = toNum(cellVal(sheet, r, 10));
      const order_number = toStr(cellVal(sheet, r, 11));

      // Calculate already_invoiced from total - open
      const already_invoiced_amount = total_net_amount > 0 ? Math.max(0, total_net_amount - open_amount) : 0;

      // Map status
      const sl = status.toLowerCase();
      let mappedStatus = 'active';
      if (sl.includes('abgeschlossen') || sl.includes('fertig')) mappedStatus = 'completed';
      else if (sl.includes('pausiert') || sl.includes('on hold')) mappedStatus = 'on_hold';
      else if (sl.includes('storniert') || sl.includes('abgesagt') || sl.includes('annulliert')) mappedStatus = 'cancelled';
      else if (sl.includes('unklar')) mappedStatus = 'unclear';

      // Monthly values
      const monthly_values = {};
      for (const { month, ist: ic, soll: sc } of MONTH_COLS) {
        const istVal = cellVal(sheet, r, ic);
        const sollVal = cellVal(sheet, r, sc);
        // Skip if it's a date value (Excel dates are large numbers ~40000-50000)
        const ist = (istVal !== null && typeof istVal === 'number' && istVal < 10000) ? istVal : 0;
        const soll = (sollVal !== null && typeof sollVal === 'number' && sollVal < 10000) ? sollVal : 0;
        if (ist !== 0 || soll !== 0) {
          monthly_values[month] = { ist, soll };
        }
      }

      const combined_notes = [payment_notes, notes].filter(Boolean).join(' | ');

      projects.push({
        status: mappedStatus,
        customer,
        project_name,
        project_manager,
        total_net_amount,
        already_invoiced_amount,
        open_amount,
        external_costs,
        notes: combined_notes,
        order_number,
        monthly_values,
        source_sheet: sheetName,
        import_batch_id: batchId,
      });
    }

    if (dry_run) {
      return Response.json({ success: true, dry_run: true, count: projects.length, preview: projects.slice(0, 10) });
    }

    await base44.entities.LiquidityProject.bulkCreate(projects);
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'import',
      entity_type: 'LiquidityProject',
      details: `Importiert ${projects.length} Projekte aus "Projekte 2026"`,
      import_batch_id: batchId,
    });

    return Response.json({ 
      success: true, 
      count: projects.length,
      batch_id: batchId,
      message: `${projects.length} Projekte erfolgreich importiert.`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});