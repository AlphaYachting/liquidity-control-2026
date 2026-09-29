import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Link auf die Seite „Module hinzufügen“ des Behälters.
export default function ModulHinzufuegenKnopf({ milestone }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={`/sprint/sprints/${milestone.sprint_id}/module`}><Plus className="w-4 h-4" /> Modul hinzufügen</Link>
    </Button>
  );
}