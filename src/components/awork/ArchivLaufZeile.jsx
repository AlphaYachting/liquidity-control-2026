import React, { useState } from 'react';

const FARBE = {
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

// Ein vergangener Archiv-Export: Datum, Zeilenzahl, aufklappbares Manifest mit Download-Links.
export default function ArchivLaufZeile({ lauf, zeit }) {
  const [offen, setOffen] = useState(false);
  const urls = (lauf.notes || '').match(/https?:\/\/\S+/g) || [];

  return (
    <div className="px-3 py-2 text-xs">
      <button onClick={() => setOffen((v) => !v)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="text-muted-foreground">{zeit}</span>
        <span className="truncate flex-1">{lauf.records_fetched || 0} Datensätze</span>
        <span className={`px-2 py-0.5 rounded-full shrink-0 ${FARBE[lauf.status] || FARBE.failed}`}>{lauf.status}</span>
      </button>
      {offen && (
        <div className="mt-2 space-y-2">
          {urls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                  Datei öffnen
                </a>
              ))}
            </div>
          )}
          <pre className="whitespace-pre-wrap text-[10px] text-muted-foreground bg-muted/40 rounded p-2 max-h-64 overflow-auto">
            {lauf.notes || '— kein Manifest —'}
          </pre>
        </div>
      )}
    </div>
  );
}