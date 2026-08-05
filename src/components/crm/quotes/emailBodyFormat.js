// Wandelt den KI-Mailtext (evtl. mit Markdown-Resten) in zwei saubere Formen um:
// 1. Plain-Text ohne Sterne/# — für mailto und einfaches Einfügen
// 2. HTML mit echten Hervorhebungen — landet als formatierter Text in der Zwischenablage

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Erkennung einer Zwischenüberschrift: Markdown-# ODER kurze Zeile, die mit ":" endet
const isHeading = (line) =>
  /^#{1,4}\s+/.test(line) || (/^[^-–•*].{0,60}:$/.test(line.trim()) && !line.includes('€'));

const stripHeadingMarks = (line) => line.replace(/^#{1,4}\s+/, '').trim();
const isBullet = (line) => /^\s*[-–•*]\s+/.test(line);
const stripBulletMarks = (line) => line.replace(/^\s*[-–•*]\s+/, '').trim();

// Inline-Markdown entfernen, Text behalten
const stripInline = (s) =>
  s
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1');

// Inline-Markdown in echtes HTML übersetzen
const inlineToHtml = (s) => {
  let out = escapeHtml(s);
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__(.+?)__/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/_(.+?)_/g, '<em>$1</em>');
  out = out.replace(/`(.+?)`/g, '$1');
  return out;
};

// Sauberer Klartext: keine Sterne, keine #, Trennstriche raus, Aufzählungen mit "– "
export function toPlainText(body) {
  return String(body || '')
    .split('\n')
    .filter((line) => !/^\s*([-_*]\s*){3,}\s*$/.test(line)) // ---- / *** Trennlinien
    .map((line) => {
      if (isHeading(line)) return stripInline(stripHeadingMarks(line)).toUpperCase();
      if (isBullet(line)) return '– ' + stripInline(stripBulletMarks(line));
      return stripInline(line);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// HTML mit Inline-Styles — überlebt das Einfügen in Mail-Programme (Outlook, Apple Mail, Gmail)
export function toHtml(body) {
  const lines = String(body || '').split('\n');
  const blocks = [];
  let list = null;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(`<p style="margin:0 0 12px 0;">${para.map(inlineToHtml).join('<br>')}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(`<ul style="margin:0 0 12px 0;padding-left:20px;">${list.join('')}</ul>`);
      list = null;
    }
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (/^\s*([-_*]\s*){3,}\s*$/.test(line)) return; // Trennlinien verwerfen
    if (!line.trim()) { flushPara(); flushList(); return; }
    if (isHeading(line)) {
      flushPara(); flushList();
      blocks.push(`<p style="margin:16px 0 6px 0;font-weight:700;">${inlineToHtml(stripHeadingMarks(line))}</p>`);
      return;
    }
    if (isBullet(line)) {
      flushPara();
      if (!list) list = [];
      list.push(`<li style="margin:0 0 4px 0;">${inlineToHtml(stripBulletMarks(line))}</li>`);
      return;
    }
    flushList();
    para.push(line);
  });
  flushPara(); flushList();

  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;">${blocks.join('')}</div>`;
}

// Formatierten Text (HTML + Plain-Fallback) in die Zwischenablage legen
export async function copyFormatted(body) {
  const html = toHtml(body);
  const plain = toPlainText(body);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}