// Aufräumen von Modelltext für E-Mail-Entwürfe: kein Markdown, keine Trennlinien,
// Aufzählungen einheitlich mit "- ".
export const cleanMailText = (raw: string) =>
  String(raw || '')
    .split('\n')
    .filter((l: string) => !/^\s*([-_*]\s*){3,}\s*$/.test(l))
    .map((l: string) =>
      l
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\s*[•*–]\s+/, '- ')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .trimEnd(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();