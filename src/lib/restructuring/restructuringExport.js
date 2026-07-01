import { jsPDF } from 'jspdf';

const HEADER_TITLE = 'Sanierungs-Reporting';

const fmtStand = () =>
  new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

/**
 * Excel-Export (als CSV mit BOM, öffnet direkt in Excel).
 * @param {string} reportName  z.B. "Forderungsspiegel"
 * @param {string[]} columns   Spaltenüberschriften
 * @param {Array<Array>} rows  Zeilendaten (Strings/Numbers)
 * @param {string} sourceNote  Datenquelle
 */
export function exportExcel(reportName, columns, rows, sourceNote = '') {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [];
  lines.push([`${HEADER_TITLE} — ${reportName}`]);
  lines.push([`Stand ${fmtStand()}`]);
  if (sourceNote) lines.push([`Datenquelle: ${sourceNote}`]);
  lines.push([]);
  lines.push(columns.map(esc).join(';'));
  rows.forEach((r) => lines.push(r.map(esc).join(';')));
  const csv = '\uFEFF' + lines.map((l) => (Array.isArray(l) ? l.join(';') : l)).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${HEADER_TITLE}_${reportName}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * PDF-Export, druckfertig, sachlich.
 * @param {string} reportName
 * @param {string[]} columns
 * @param {Array<Array>} rows
 * @param {object} opts { sourceNote, summaryLines: string[], numericCols: number[] (rechtsbündig) }
 */
export function exportPDF(reportName, columns, rows, opts = {}) {
  const { sourceNote = '', summaryLines = [], numericCols = [] } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 12;
  let y = 16;

  // Kopf
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`${HEADER_TITLE} — ${reportName}`, marginX, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Stand ${fmtStand()}`, marginX, y);
  if (sourceNote) {
    y += 4.5;
    doc.text(`Datenquelle: ${sourceNote}`, marginX, y);
  }
  doc.setTextColor(0);
  y += 6;

  // Spaltenbreiten
  const usableW = pageW - marginX * 2;
  const colW = usableW / columns.length;

  const drawHeader = () => {
    doc.setFillColor(240, 242, 245);
    doc.rect(marginX, y - 4, usableW, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    columns.forEach((c, i) => {
      const x = marginX + i * colW;
      const align = numericCols.includes(i) ? 'right' : 'left';
      doc.text(String(c), align === 'right' ? x + colW - 2 : x + 1.5, y, { align });
    });
    y += 4;
    doc.setDrawColor(210);
    doc.line(marginX, y, marginX + usableW, y);
    y += 3;
  };

  drawHeader();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  rows.forEach((r) => {
    if (y > pageH - 14) {
      doc.addPage();
      y = 16;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    r.forEach((cell, i) => {
      const x = marginX + i * colW;
      const align = numericCols.includes(i) ? 'right' : 'left';
      const txt = cell === null || cell === undefined ? '' : String(cell);
      const clipped = txt.length > 40 && align === 'left' ? txt.slice(0, 38) + '…' : txt;
      doc.text(clipped, align === 'right' ? x + colW - 2 : x + 1.5, y, { align });
    });
    y += 5;
  });

  if (summaryLines.length) {
    y += 2;
    doc.setDrawColor(180);
    doc.line(marginX, y, marginX + usableW, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    summaryLines.forEach((s) => {
      if (y > pageH - 12) { doc.addPage(); y = 16; }
      doc.text(s, marginX, y);
      y += 5;
    });
  }

  doc.save(`${HEADER_TITLE}_${reportName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}