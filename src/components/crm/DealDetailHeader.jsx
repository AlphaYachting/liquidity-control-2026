import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Pencil, Trophy, XCircle, RotateCcw, Trash2, MoreHorizontal, Building2, User } from 'lucide-react';
import Seitenkopf from '@/components/shared/Seitenkopf';
import StatusEtikett from '@/components/shared/StatusEtikett';
import { PIPELINES, STAGE_LABELS, isClosedStage, isWonStage } from '@/components/crm/stages';

const QUELLE = {
  phone_ai: 'Telefon-KI', email: 'E-Mail', manual: 'Manuell',
  referral: 'Empfehlung', website: 'Website', other: 'Sonstige',
};

// Kopf der Deal-Seite — ohne Kasten, ohne Phasenfeld (das trägt die Phasenleiste).
export default function DealDetailHeader({ deal, onEdit, onClose, onReopen, onDelete }) {
  const config = PIPELINES[deal.pipeline];
  const closed = isClosedStage(deal.stage);
  const won = isWonStage(deal.stage);
  const gleich = deal.company_name && deal.contact_name
    && deal.company_name.trim().toLowerCase() === deal.contact_name.trim().toLowerCase();

  const Menue = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit} className="gap-2"><Pencil className="w-3.5 h-3.5" /> Deal bearbeiten</DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="w-3.5 h-3.5" /> Deal löschen</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div>
      <Seitenkopf
        zurueck={{ to: '/crm', label: `Pipeline · ${config.label}` }}
        titel={deal.title}
        versalien={false}
        kontext={
          <span className="inline-flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {deal.company_name && (
              <span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{deal.company_name}</span>
            )}
            {deal.contact_name && !gleich && (
              <span className="inline-flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{deal.contact_name}</span>
            )}
            <span>Quelle: {QUELLE[deal.source] || deal.source}</span>
          </span>
        }
        aktionen={
          closed ? (
            <>
              <StatusEtikett ton={won ? 'done' : 'neutral'}>
                {String(STAGE_LABELS[deal.stage] || '').replace(' ✓', '')}
                {deal.closed_at ? ` am ${new Date(deal.closed_at).toLocaleDateString('de-AT')}` : ''}
              </StatusEtikett>
              <Button variant="outline" onClick={onReopen}><RotateCcw /> Wieder öffnen</Button>
              {Menue}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onClose('won')}><Trophy /> Beauftragen</Button>
              <Button variant="outline" onClick={() => onClose('lost')}><XCircle /> Verloren</Button>
              {Menue}
            </>
          )
        }
      />
      {closed && !won && deal.lost_reason && (
        <p className="text-meta text-muted-foreground">Grund: {deal.lost_reason}</p>
      )}
    </div>
  );
}