import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user?.role !== 'admin') return Response.json({ error: 'Verboten' }, { status: 403 });
  const db = base44.asServiceRole.entities;
  const existing = await db.Setting.filter({ key: 'zeit_pflicht_ab' }, 'key', 1).catch(() => []);
  if (existing.length > 0) return Response.json({ alreadyExists: true, id: existing[0].id, value: existing[0].value });
  const created = await db.Setting.create({ key: 'zeit_pflicht_ab', value: '2026-10-05' });
  return Response.json({ created: true, id: created.id, value: created.value });
}
