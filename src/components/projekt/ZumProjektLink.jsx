import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FolderKanban } from 'lucide-react';

// Link vom Cockpit bzw. Auftrag zum Projekt (dessen jüngster Sprint/Behälter).
export default function ZumProjektLink({ projectRefId, className = '' }) {
  const { data: sprint } = useQuery({
    queryKey: ['projektSprint', projectRefId],
    enabled: !!projectRefId,
    queryFn: async () => (await base44.entities.Sprint.filter({ project_id: projectRefId }, '-created_date', 1))[0] || null,
  });
  if (!projectRefId) return null;
  return (
    <Link
      to={sprint ? `/sprint/sprints/${sprint.id}` : '/sprint/projekte'}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline ${className}`}
    >
      <FolderKanban className="w-3.5 h-3.5" /> Zum Projekt
    </Link>
  );
}