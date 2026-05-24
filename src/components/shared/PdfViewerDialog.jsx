import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, X } from 'lucide-react';

export default function PdfViewerDialog({ open, onClose, url, title }) {
  if (!url) return null;

  // Detect if it's a PDF (by URL ending or assume it is)
  const isPdf = url.toLowerCase().includes('.pdf') || url.includes('pdf');

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl w-[90vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <DialogTitle className="text-sm font-medium truncate max-w-[70%]">{title}</DialogTitle>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <ExternalLink className="w-3 h-3" />
                Extern öffnen
              </Button>
            </a>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <iframe
            src={url}
            className="w-full h-full border-0"
            title={title}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}