import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { DOC_TYPE_META, buildDoc, loadDocText } from '@/components/crm/proposals/sourceDocs';
import NotesCaptureBar from '@/components/crm/proposals/NotesCaptureBar';

// Zeigt die eigenständigen Quell-Dokumente (Anhänge) und erlaubt Hinzufügen/Entfernen.
export default function SourceDocumentsPanel({ title, hint, types, documents = [], onAdd, onRemove, disabled }) {
  const [previewIdx, setPreviewIdx] = useState(null);
  const [previewText, setPreviewText] = useState('');
  const docs = documents.map((d, i) => ({ d, i })).filter(({ d }) => types.includes(d.doc_type));

  const handleAdd = async (docType, label, text) => {
    const doc = await buildDoc(docType, label, text);
    await onAdd(doc);
  };

  const togglePreview = async (i, d) => {
    if (previewIdx === i) { setPreviewIdx(null); return; }
    setPreviewText(await loadDocText(d));
    setPreviewIdx(i);
  };

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold">{title}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>

      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map(({ d, i }) => {
            const meta = DOC_TYPE_META[d.doc_type] || { label: d.doc_type, icon: '📄' };
            return (
              <div key={i} className="rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="text-base shrink-0">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{meta.label}{d.label ? ` — ${d.label}` : ''}</p>
                    <p className="text-[10px] text-muted-foreground">{(d.size_chars || d.text?.length || 0).toLocaleString('de-AT')} Zeichen</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => togglePreview(i, d)}>
                    {previewIdx === i ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    disabled={disabled} onClick={() => onRemove(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {previewIdx === i && (
                  <div className="border-t px-3 py-2 max-h-64 overflow-y-auto">
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">{previewText}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <NotesCaptureBar types={types} disabled={disabled} onAddDocument={handleAdd} />
    </div>
  );
}