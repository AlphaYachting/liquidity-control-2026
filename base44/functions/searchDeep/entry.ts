import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { normalize } from '../../shared/searchNormalize.js';

// Zweite Stufe: was nicht im Index liegt — Verläufe und Kundenakt im Volltext.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { q } = await req.json();
    const suche = normalize(q);
    if (!suche) return Response.json({ treffer: [] });

    const sr = base44.asServiceRole;
    const fenster = new Date(Date.now() - 180 * 86400000).toISOString();

    const threads = await sr.entities.EmailThreadIndex.list('-last_message_at', 1500);
    const postfach = threads
      .filter((t) => (t.last_message_at || '') >= fenster)
      .filter((t) => normalize(`${t.subject} ${t.customer} ${t.last_from_name}`).includes(suche))
      .slice(0, 6)
      .map((t) => ({
        entry_type: 'akte',
        title: t.subject || '(ohne Betreff)',
        subtitle: [t.customer, t.last_message_at ? String(t.last_message_at).slice(0, 10) : null].filter(Boolean).join(' · '),
        client_name: t.customer || '',
        route: `/crm/emails?thread=${t.thread_id}`,
        activity_at: t.last_message_at,
        weight: 16,
      }));

    const akten = await sr.entities.ProjectFileEntry.list('-updated_date', 1500);
    const akte = akten
      .filter((a) => normalize(`${a.title} ${a.content} ${a.ai_summary} ${a.follow_up_text}`).includes(suche))
      .slice(0, 4)
      .map((a) => ({
        entry_type: 'akte',
        title: a.title || 'Kundenakt-Eintrag',
        subtitle: String(a.content || a.ai_summary || '').slice(0, 120),
        client_name: '',
        route: `/projects/${a.project_id}/akte`,
        activity_at: a.entry_date || a.updated_date,
        weight: 14,
      }));

    return Response.json({ treffer: [...postfach, ...akte] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}