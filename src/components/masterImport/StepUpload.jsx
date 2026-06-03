import React, { useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function StepUpload({ onParsed, onSessionCreated }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setError('Nur Excel (.xlsx, .xls) oder CSV-Dateien erlaubt.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      // Upload file to storage
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Create session record
      const session = await base44.entities.MasterImportSession.create({
        file_name: file.name,
        file_url,
        source_type: ext === 'csv' ? 'csv' : 'excel',
        uploaded_at: new Date().toISOString(),
        status: 'uploaded',
      });
      onSessionCreated(session);

      // Parse via backend function
      const resp = await base44.functions.invoke('parseExcelImport', { file_url });
      if (resp.data?.error) throw new Error(resp.data.error);
      onParsed(resp.data, session);
    } catch (e) {
      setError(e.message || 'Fehler beim Upload oder Parsen.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 1: Excel-Projektliste hochladen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Lade die aktuelle Excel-Projektliste des Projektmanagements hoch. Die Datei wird analysiert und mit bestehenden Daten abgeglichen.
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
        onClick={() => document.getElementById('excel-file-input').click()}
      >
        <input
          id="excel-file-input"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => handleFile(e.target.files[0])}
        />
        {uploading ? (
          <div className="space-y-3">
            <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium">Datei wird hochgeladen und analysiert…</p>
          </div>
        ) : (
          <div className="space-y-3">
            <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <p className="font-semibold">Excel-Datei hierher ziehen</p>
              <p className="text-sm text-muted-foreground mt-1">oder klicken um eine Datei auszuwählen</p>
            </div>
            <p className="text-xs text-muted-foreground">.xlsx · .xls · .csv</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-muted/40 border rounded-xl p-4 space-y-2 text-sm">
        <p className="font-medium">Was wird analysiert?</p>
        <ul className="space-y-1 text-muted-foreground">
          <li>• Projektname & Kunde pro Zeile</li>
          <li>• Projektmanager & Status</li>
          <li>• Auftragssumme, bereits verrechnet, offener Betrag</li>
          <li>• Erwartete Abrechnung aktueller / nächster Monat</li>
          <li>• Risiko-Status & Notizen</li>
        </ul>
      </div>
    </div>
  );
}