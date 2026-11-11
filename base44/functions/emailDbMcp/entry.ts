import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// MCP-Zugang zur E-Mail-Datenbank: nur lesend. Leitet an emailDbApi weiter (im Namen der
// angemeldeten Person), damit Vertraulichkeitsregeln und Rechte unverändert greifen.
// enrich (Zurückschreiben) ist hier bewusst nicht erlaubt.
const ERLAUBT = ['health', 'search', 'threads', 'thread'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, params } = await req.json().catch(() => ({}));
    if (!ERLAUBT.includes(action)) {
      return Response.json({ error: `Aktion nicht erlaubt: ${action}. Erlaubt: ${ERLAUBT.join(', ')}` }, { status: 400 });
    }
    const p = params && typeof params === 'object' && !Array.isArray(params) ? params : {};

    try {
      const res = await base44.functions.invoke('emailDbApi', { action, params: p });
      return Response.json(res.data);
    } catch (e) {
      const status = e?.response?.status || e?.status || 500;
      const data = e?.response?.data || e?.data || { error: e.message };
      return Response.json(data, { status });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}