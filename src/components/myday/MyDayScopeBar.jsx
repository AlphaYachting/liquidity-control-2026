import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Eye, UserCheck, FolderKanban } from 'lucide-react';

// Zeigt transparent, welchen Datenausschnitt der Nutzer gerade sieht.
export default function MyDayScopeBar({ scope, projectCount, totalOpen }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3">
      <Badge className={scope.seesAll ? 'bg-blue-100 text-blue-700 border-0 gap-1' : 'bg-amber-100 text-amber-700 border-0 gap-1'}>
        {scope.seesAll ? <Eye className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
        {scope.seesAll ? 'Gesamtsicht' : 'Meine Zuständigkeit'}
      </Badge>
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <FolderKanban className="w-3.5 h-3.5" />
        {projectCount} {scope.seesAll ? 'aktive Projekte' : 'Projekte in meiner Verantwortung'}
      </span>
      <span className="text-xs text-muted-foreground">·</span>
      <span className="text-xs font-medium">
        {totalOpen === 0 ? 'Keine offenen Aufgaben' : `${totalOpen} offene Aufgaben`}
      </span>
      {!scope.seesAll && scope.aliases.length > 0 && (
        <span className="text-[11px] text-muted-foreground ml-auto">
          Zuordnung über: {scope.aliases.join(', ')}
        </span>
      )}
    </div>
  );
}