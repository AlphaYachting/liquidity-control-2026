import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import * as XLSX from 'npm:xlsx@0.18.5';
import { assertSafeFileUrl } from '../../shared/safeFileUrl.ts';

const DEPT_MAP = {
  'design': 'design',
  'marketing': 'marketing',
  'online marketing': 'marketing',
  'seo': 'marketing',
  'programmierung': 'programming',
  'programming': 'programming',
  'pm': 'project_management',
  'project management': 'project_management',
  'allgemein': 'general',
  'general': 'general',
};

function mapDept(raw) {
  if (!raw) return 'other';
  const lower = String(raw).toLowerCase().trim();
  for (const [key, val] of Object.entries(DEPT_MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'other';
}

function mapInterval(raw) {
  if (!raw) return 'monthly';
  const lower = String(raw).toLowerCase();
  if (lower.includes('jährlich') || lower.includes('jahrlich') || lower.includes('year')) return 'yearly';
  if (lower.includes('einmal') || lower.includes('once') || lower.includes('one')) return 'one_time';
  if (lower.includes('quartals') || lower.includes('quartal') || lower.includes('quarter')) return 'quarterly';
  return 'monthly';
}

function mapStatus(raw) {
  if (!raw) return 'pending';
  const lower = String(raw).toLowerCase();
  if (lower.includes('bez') || lower.includes('paid')) return 'paid';
  if (lower.includes('über') || lower.includes('overdue')) return 'overdue';
  return 'pending';
}

function excelDateToISO(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const m = val.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }
  if (typeof val === 'number') {
    // Excel serial date: days since 1900-01-01 (with leap year bug correction)
    const d = new Date(Date.UTC(1899, 11, 30) + val * 86400000);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    if (y > 1900 && y < 2100) return `${y}-${mo}-${day}`;
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const fileUrl = body.file_url;
    if (!fileUrl) return Response.json({ error: 'file_url required' }, { status: 400 });

    // Download the file (URL serverseitig validiert — SSRF-Schutz)
    let safeUrl: string;
    try {
      safeUrl = assertSafeFileUrl(fileUrl);
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    const fileRes = await fetch(safeUrl);
    if (!fileRes.ok) throw new Error(`Download failed: ${fileRes.status}`);
    const arrayBuffer = await fileRes.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const workbook = XLSX.read(data, { type: 'array', cellDates: false });

    // Find the TOOLKOSTEN sheet
    const sheetName = workbook.SheetNames.find(n => n.includes('TOOLKOSTEN') || n.includes('Toolkosten'));
    if (!sheetName) return Response.json({ error: 'Sheet TOOLKOSTEN nicht gefunden', sheets: workbook.SheetNames }, { status: 400 });

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // Columns based on sample:
    // 0: tool name (col_0)
    // 1: Kosten / Jahr
    // 2: Kosten / Monat
    // 3: Zahlungs Status
    // 4: Start Abo
    // 5: Fälligkeit
    // 6: Zahlungsintervall
    // 7: Abteilung (but header row shows "Marketing" in col 6 for first data row)
    // 8: Benötigt
    // 9: Weiterverrechnung
    // 10: Info

    const batchId = `toolkosten2026_${Date.now()}`;
    const records = [];
    let currentDept = 'other';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;

      const toolName = String(row[0]).trim();
      if (!toolName) continue;

      // Skip header row
      if (toolName === 'col_0' || toolName === 'Name') continue;

      // Detect section headers (DESIGN, MARKETING, etc.) — all caps, no cost values
      const hasCost = (row[1] != null && Number(row[1]) > 0) || (row[2] != null && Number(row[2]) > 0);
      if (!hasCost && toolName === toolName.toUpperCase() && toolName.length < 30 && !toolName.includes('.')) {
        currentDept = mapDept(toolName);
        continue;
      }

      const annualCost = Number(row[1]) || 0;
      const monthlyCost = Number(row[2]) || (annualCost > 0 ? Math.round(annualCost / 12 * 100) / 100 : 0);

      // Skip rows with no cost and suspicious names (status labels, etc.)
      const skipWords = ['gekündigt', 'gesamt', 'summe', 'total', 'laufende kosten', 'einmalig', 'wiederkehrende', 'abteilung'];
      if (skipWords.some(w => toolName.toLowerCase().includes(w))) continue;
      if (!annualCost && !monthlyCost && toolName.length < 3) continue;

      const deptRaw = row[7] || null;
      const dept = deptRaw ? mapDept(String(deptRaw)) : currentDept;

      records.push({
        tool_name: toolName,
        department: dept,
        annual_cost: annualCost,
        monthly_cost: monthlyCost,
        payment_status: mapStatus(row[3]),
        subscription_start: excelDateToISO(row[4]),
        due_date: excelDateToISO(row[5]),
        payment_interval: mapInterval(row[6]),
        needed: row[8] !== false && row[8] !== 0 && row[8] !== 'FALSE',
        customer_recharge: row[9] ? String(row[9]) : null,
        info: row[10] ? String(row[10]) : null,
        category: toolName === toolName.toUpperCase() ? null : currentDept,
        source_sheet: sheetName,
        import_batch_id: batchId,
      });
    }

    if (records.length === 0) {
      return Response.json({ error: 'Keine gültigen Datensätze gefunden' }, { status: 400 });
    }

    await base44.entities.ToolCost.bulkCreate(records);
    await base44.entities.AuditLog.create({
      action: 'import',
      entity_type: 'ToolCost',
      details: `Toolkosten 2026 importiert: ${records.length} Tools`,
      import_batch_id: batchId,
    });

    return Response.json({ success: true, imported: records.length, batch_id: batchId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});