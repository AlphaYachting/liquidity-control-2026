import { base44 } from '@/api/base44Client';
import { extractDocxText } from '@/components/crm/quotes/docxText';

// Transkript für den Meeting-Import einlesen. Logik aus der Erfassungsleiste der Angebote
// (NotesCaptureBar) übernommen — die CRM-Komponenten bleiben unverändert.

// WebVTT/SRT: Kopf, Nummern und Zeitstempel weg, Sprecherangaben als „Name: Text“ behalten,
// aufeinanderfolgende Zeilen desselben Sprechers zusammenziehen.
export function untertitelZuText(roh) {
  const zeilen = String(roh || '').replace(/\r/g, '').split('\n');
  const aus = [];
  let letzterSprecher = null;
  for (let z of zeilen) {
    z = z.trim();
    if (!z || z === 'WEBVTT' || /^NOTE\b/.test(z) || /^\d+$/.test(z)) continue;
    if (/-->/.test(z)) continue;
    let sprecher = null;
    let text = z;
    const vTag = z.match(/^<v\s+([^>]+)>(.*)$/i);
    if (vTag) { sprecher = vTag[1].trim(); text = vTag[2]; }
    text = text.replace(/<\/?[^>]+>/g, '').trim();
    if (!vTag) {
      const m = text.match(/^([A-ZÄÖÜ][\wÄÖÜäöüß.\- ]{1,40}):\s+(.*)$/);
      if (m) { sprecher = m[1].trim(); text = m[2]; }
    }
    if (!text) continue;
    if (sprecher && sprecher === letzterSprecher && aus.length) aus[aus.length - 1] += ' ' + text;
    else if (sprecher) { aus.push(`${sprecher}: ${text}`); letzterSprecher = sprecher; }
    else if (aus.length && !letzterSprecher) aus[aus.length - 1] += ' ' + text;
    else { aus.push(text); letzterSprecher = null; }
  }
  return aus.join('\n');
}

export async function leseDatei(file) {
  const name = file?.name || 'Transkript';
  let text = '';
  if (/\.pdf$/i.test(name)) {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: { type: 'object', properties: { transcript_text: { type: 'string', description: 'Der vollständige Textinhalt des Dokuments' } } },
    });
    if (res.status !== 'success') throw new Error(res.details || 'PDF konnte nicht gelesen werden');
    text = res.output?.transcript_text || (Array.isArray(res.output) ? res.output.map((o) => o.transcript_text).join('\n') : '');
  } else if (/\.docx$/i.test(name)) {
    text = await extractDocxText(file);
  } else if (/\.doc$/i.test(name)) {
    throw new Error('Bitte die Datei als .docx speichern (altes .doc-Format wird nicht unterstützt)');
  } else if (/\.(vtt|srt)$/i.test(name)) {
    text = untertitelZuText(await file.text());
  } else {
    text = await file.text();
  }
  if (!String(text || '').trim()) throw new Error('Im Dokument wurde kein Text gefunden');
  return { text: String(text).trim(), name };
}

// Audio: privat hochladen (nicht öffentlich erreichbar), mit kurz gültigem Link transkribieren.
// Die Audiodatei wird nirgends verknüpft oder gespeichert — weder Link noch Kennung.
// Hinweis: Base44 bietet kein Löschen hochgeladener Dateien; die private Ablage ist ohne
// gültigen, signierten Link nicht abrufbar.
export async function transkribiereAudio(file) {
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
  const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 900 });
  const text = await base44.integrations.Core.TranscribeAudio({ audio_url: signed_url });
  const roh = typeof text === 'string' ? text : (text?.text || text?.transcript || '');
  if (!String(roh || '').trim()) throw new Error('In der Aufnahme wurde kein Text erkannt');
  return { text: String(roh).trim(), name: file?.name || 'Audio' };
}
