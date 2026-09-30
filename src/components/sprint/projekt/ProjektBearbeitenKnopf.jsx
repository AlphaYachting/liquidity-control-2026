import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import ProjectFormDialog from '@/components/sprint/ProjectFormDialog';

// Admin: Projekt direkt aus der Detailansicht bearbeiten.
export default function ProjektBearbeitenKnopf({ project, onSaved }) {
  const [open, setOpen] = useState(false);
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('name', 500),
    enabled: open,
  });

  return (
    <>
      <Button variant="outline" size="sm" className="rounded" onClick={() => setOpen(true)}>
        <Settings2 className="w-3.5 h-3.5 mr-1" /> Projekt bearbeiten
      </Button>
      <ProjectFormDialog
        open={open}
        onOpenChange={setOpen}
        project={project}
        clients={clients}
        onSaved={() => { setOpen(false); onSaved?.(); }}
      />
    </>
  );
}