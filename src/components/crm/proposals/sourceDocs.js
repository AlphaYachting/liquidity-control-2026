import { base44 } from '@/api/base44Client';

export const DOC_TYPE_META = {
  transcript: { label: 'Transkript', icon: '📝' },
  email: { label: 'Kunden-E-Mail', icon: '✉️' },
  voice_memo: { label: 'Sprachmemo', icon: '🎙️' },
  briefing: { label: 'Kundenbriefing', icon: '📋' },
};

const LIMIT = 8000;

// Erzeugt ein Quell-Dokument-Objekt; große Inhalte werden als Datei ausgelagert.
export async function buildDoc(doc_type, label, text) {
  const base = { doc_type, label: label || '', size_chars: (text || '').length, added_at: new Date().toISOString() };
  if ((text || '').length <= LIMIT) return { ...base, text: text || '', text_url: '' };
  const file = new File([text], `${doc_type}.txt`, { type: 'text/plain' });
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return { ...base, text: '', text_url: file_url };
}

export async function loadDocText(doc) {
  if (doc?.text) return doc.text;
  if (!doc?.text_url) return '';
  const res = await fetch(doc.text_url);
  return res.text();
}

// Fügt alle Dokumente mit klaren Anfang/Ende-Markierungen zusammen,
// damit die KI die einzelnen Quellen sauber trennen kann.
export async function composeDocsText(docs) {
  const parts = [];
  for (let i = 0; i < (docs || []).length; i++) {
    const d = docs[i];
    const text = await loadDocText(d);
    if (!text.trim()) continue;
    const meta = DOC_TYPE_META[d.doc_type] || { label: d.doc_type };
    const title = `${meta.label}${d.label ? ` — ${d.label}` : ''}`;
    parts.push(`=== DOKUMENT ${i + 1}: ${title} ===\n${text.trim()}\n=== ENDE DOKUMENT ${i + 1} ===`);
  }
  return parts.join('\n\n');
}

// Gesamter Input für die KI: Quell-Dokumente + manuelle Notizen.
export async function composeNotes(proposal, manualNotes) {
  const parts = [];
  const docsText = await composeDocsText(proposal?.source_documents || []);
  if (docsText) parts.push(docsText);
  if (manualNotes?.trim()) parts.push(`=== MANUELLE NOTIZEN ===\n${manualNotes.trim()}`);
  return parts.join('\n\n');
}