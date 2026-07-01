import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Sheet } from 'lucide-react';
import { fmtDate } from '@/lib/restructuring/restructuringFormat';

/**
 * Einheitlicher Rahmen für jede Sanierungs-Auswertung.
 * Zeigt Titel, Stichtag, Datenquelle und Export-Buttons (PDF/Excel).
 */
export default function ReportCard({ title, sourceNote, onExportPDF, onExportExcel, children, actions }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 border-b bg-muted/30">
        <div>
          <h2 className="text-sm font-bold tracking-tight">{title}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Stichtag {fmtDate(new Date())}
            {sourceNote && <span> · Datenquelle: {sourceNote}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
          {onExportPDF && (
            <Button variant="outline" size="sm" onClick={onExportPDF} className="h-8">
              <FileText className="w-3.5 h-3.5 mr-1.5" /> PDF
            </Button>
          )}
          {onExportExcel && (
            <Button variant="outline" size="sm" onClick={onExportExcel} className="h-8">
              <Sheet className="w-3.5 h-3.5 mr-1.5" /> Excel
            </Button>
          )}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}