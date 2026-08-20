import { base44 } from '@/api/base44Client';

// System-Verlauf: automatische Einträge im Kommentarstrang (Statuswechsel, Freeze, Freigabe)
export async function schreibeSystemEintrag({ project_id, milestone_id, ticket_id, text }) {
  if (!project_id || !text) return;
  await base44.entities.Comment.create({
    project_id,
    milestone_id: milestone_id || undefined,
    ticket_id: ticket_id || undefined,
    author_email: 'System',
    text,
    created_at: new Date().toISOString(),
  });
}