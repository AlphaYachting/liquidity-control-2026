import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet, emailDbEnrich } from '../../shared/emailDb.ts';

const CATEGORIES = ['abnahme_freigabe', 'rechnung_zahlung', 'reklamation', 'anforderung_change', 'terminabstimmung', 'rueckfrage_antwort', 'sonstiges'];
const STATUSES = ['offen', 'beantwortet', 'erledigt', 'wartet_auf_kunde'];

// Batch-KI-Auswertung: klassifiziert noch nicht ausgewertete E-Mail-Threads
// (Kategorie, Status, Eskalation, Zusammenfassung, Kundenzuordnung) und
// schreibt die Ergebnisse in die zentrale E-Mail-Datenbank zurück.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Number(body.batch_size) || 8, 15);

    // Bekannte Kundennamen als Matching-Hilfe für die KI
    const projects = await base44.asServiceRole.entities.LiquidityProject.list('-updated_date', 300);
    const knownCustomers = [...new Set(projects.map((p) => p.customer).filter(Boolean))];

    // Neueste Threads holen und die noch nicht ausgewerteten herausfiltern
    const listing = await emailDbGet('threads', { days: 30, limit: 100 });
    const pending = (listing.results || []).filter((t) => !t.summary && !t.category).slice(0, batchSize);

    let analyzed = 0, skipped = 0, escalations = 0;
    const errors = [];

    for (const t of pending) {
      try {
        const detail = await emailDbGet('thread', { id: t.id, msgs: 10, full: 1 });
        const messages = detail.messages || [];
        if (!messages.length) { skipped++; continue; }

        const convo = messages
          .map((m) => `[${m.direction === 'in' ? 'KUNDE' : m.direction === 'out' ? 'WIR' : 'INTERN'}] ${m.from_name || m.from} (${m.received_at}):\n${(m.text || m.preview || '').slice(0, 2500)}`)
          .join('\n\n---\n\n')
          .slice(0, 25000);

        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Du bist der E-Mail-Analyst der Digitalagentur Rittler & Co. Analysiere diese E-Mail-Konversation. Antworte auf Deutsch, präzise, nichts erfinden.

BEKANNTE KUNDEN DER AGENTUR (für die Zuordnung, exakt einen dieser Namen verwenden wenn es passt):
${knownCustomers.join(', ')}

BETREFF: ${t.subject || '—'}

KONVERSATION:
"""
${convo}
"""

Regeln:
- Spam, Newsletter, Werbung, Cold-Outreach: category "sonstiges", status "erledigt", summary "Spam/Werbung — nicht relevant", eskalation false, customer_normalized leer.
- Eskalation = true nur bei erkennbar unzufriedenem Kunden, Beschwerde, Mahnung, Fristdruck oder Konfliktton.
- customer_normalized: exakter Name aus der Kundenliste wenn zuordenbar, sonst erkennbarer Firmenname, sonst leer.`,
          response_json_schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              category: { type: 'string', enum: CATEGORIES },
              status: { type: 'string', enum: STATUSES },
              eskalation: { type: 'boolean' },
              customer_normalized: { type: 'string' },
            },
          },
        });

        const fields = {
          summary: result.summary || '',
          category: CATEGORIES.includes(result.category) ? result.category : 'sonstiges',
          status: STATUSES.includes(result.status) ? result.status : 'offen',
          eskalation: result.eskalation ? 1 : 0,
          zuordnung_status: 'automatisch',
          klass_modell: 'base44-batch',
        };
        if (result.customer_normalized && String(result.customer_normalized).trim()) {
          fields.customer_normalized = String(result.customer_normalized).trim();
        }
        await emailDbEnrich(t.id, fields);
        analyzed++;
        if (result.eskalation) escalations++;
      } catch (e) {
        errors.push(`Thread ${t.id}: ${e.message}`);
      }
    }

    return Response.json({ pending_found: pending.length, analyzed, skipped, escalations, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});