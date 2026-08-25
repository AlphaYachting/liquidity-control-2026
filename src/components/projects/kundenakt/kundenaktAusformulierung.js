import { base44 } from '@/api/base44Client';

export const heuteIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Bereits berechnete Zahlen — das Modell soll sie nicht neu herleiten.
export const projektstandBlock = (kennzahlen, finanzen) => {
  if (!kennzahlen && !finanzen) return '';
  const std = (m) => Math.round((m || 0) / 60);
  const teile = [];
  if (kennzahlen) {
    teile.push(`Aufgaben erledigt ${kennzahlen.erledigt} von ${kennzahlen.gesamt}`);
    teile.push(`Zeitbudget ${std(kennzahlen.gebuchte_minuten)} von ${std(kennzahlen.geplante_minuten)} Stunden`);
    teile.push(`${kennzahlen.blockiert} blockiert`);
    teile.push(`nächste Frist ${kennzahlen.naechste_frist
      ? new Date(kennzahlen.naechste_frist).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })
      : 'keine'}`);
  }
  if (finanzen) {
    teile.push(`Auftragswert netto ${Math.round(finanzen.orderNet || 0)} EUR`);
    teile.push(`fakturiert ${Math.round(finanzen.invoicedNet || 0)} EUR`);
  }
  return `Aktueller Projektstand (verbindlich, nicht neu herleiten):\n${teile.join(', ')}.\n`;
};

// Rohe Mitteilung zu einem Kundenakt-Eintrag ausformulieren — nichts hinzuerfinden.
export async function ausformuliereEintrag({ text, projectName, customer, kennzahlen, finanzen }) {
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `Du unterstützt den digitalen Kundenakt der Agentur Rittler & Co.
Heutiges Datum: ${heuteIso()}
Projekt: ${projectName || '—'} | Kunde: ${customer || '—'}
${projektstandBlock(kennzahlen, finanzen)}
Eingabe des Mitarbeiters (getippt oder eingesprochen):
"""${text}"""

Formuliere aus, was dasteht. Erfinde nichts, ergänze keine Details, ziehe keine Schlüsse. Wenn die Eingabe dem Projektstand widerspricht, schreibe das in 'hinweis' — widersprich aber nicht dem Mitarbeiter, er war beim Gespräch dabei und du nicht.

Bestimme die Art des Eintrags (vereinbarung = verbindliche Absprache mit dem Kunden, update = Statusmeldung zum Projekt, dokument = das Dokument selbst ist der Inhalt), einen sachlichen Kurztitel (max. 8 Wörter), den ausformulierten Inhalt in ganzen Sätzen und eine Kernaussage in einem Satz.

Erkenne zusätzlich: (a) auf welches Datum sich die Eingabe bezieht — relative Angaben wie 'gestern' oder 'letzten Dienstag' beziehe auf das heutige Datum; ohne Angabe nimm heute. (b) ob eine Zusage oder ein nächster Schritt vereinbart wurde und bis wann — relative Fristen in ein konkretes Datum umrechnen; ohne erkennbare Zusage beide Felder leer lassen. (c) wer am Gespräch beteiligt war, wenn genannt.`,
    response_json_schema: {
      type: 'object',
      properties: {
        entry_type: { type: 'string', enum: ['vereinbarung', 'update', 'dokument'] },
        title: { type: 'string' },
        content: { type: 'string' },
        summary: { type: 'string' },
        entry_date: { type: 'string' },
        follow_up_text: { type: 'string' },
        follow_up_date: { type: 'string' },
        participants: { type: 'string' },
        hinweis: { type: 'string' },
      },
    },
  });
  if (!res || typeof res !== 'object' || !res.content) throw new Error('kein Vorschlag');
  return {
    entry_type: res.entry_type || 'update',
    title: res.title || '',
    content: res.content,
    summary: res.summary || '',
    entry_date: String(res.entry_date || heuteIso()).slice(0, 10),
    follow_up_text: res.follow_up_text || '',
    follow_up_date: res.follow_up_date ? String(res.follow_up_date).slice(0, 10) : '',
    participants: res.participants || '',
    hinweis: res.hinweis || '',
  };
}

// Vorschlag unverändert in den Kundenakt schreiben
export async function speichereEintrag(projectId, v) {
  const me = await base44.auth.me().catch(() => null);
  return base44.entities.ProjectFileEntry.create({
    project_id: projectId,
    entry_type: v.entry_type,
    title: v.title,
    content: v.content,
    ai_summary: v.summary,
    entry_date: new Date(`${v.entry_date || heuteIso()}T12:00:00`).toISOString(),
    recorded_by: me?.full_name || me?.email || '',
    participants: v.participants || '',
    follow_up_text: v.follow_up_text || '',
    follow_up_date: v.follow_up_date || undefined,
    follow_up_done: false,
  });
}