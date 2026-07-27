import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

// Exportiert Datensätze als CSV (Semikolon-getrennt, Excel-kompatibel, UTF-8 BOM)
export default function CsvExportButton({ data, columns, filename }) {
  const handleExport = () => {
    const escape = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map((c) => escape(c.label)).join(';');
    const rows = (data || []).map((row) =>
      columns.map((c) => escape(row[c.key])).join(';')
    );
    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" className="gap-2" onClick={handleExport} disabled={!data?.length}>
      <Download className="w-4 h-4" />
      CSV-Export
    </Button>
  );
}