import React from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import ProjectDetailContent from '@/components/projects/ProjectDetailContent';

export default function ProjectDetailSlideOver({ projectId, open, onClose }) {
  if (!projectId) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto p-0 flex flex-col">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between flex-shrink-0">
          <span className="font-semibold text-sm">Projektcockpit</span>
          <div className="flex items-center gap-3">
            <Link
              to={`/projects/${projectId}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              In voller Ansicht öffnen
            </Link>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ProjectDetailContent projectId={projectId} embedded={true} onClose={onClose} />
        </div>
      </SheetContent>
    </Sheet>
  );
}