import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ArrowLeft, Pencil, Trophy, XCircle, RotateCcw, Trash2, MoreHorizontal, Building2 } from 'lucide-react';
import ProposalHandoffButton from '@/components/crm/ProposalHandoffButton';
import { PIPELINES, STAGE_LABELS, SOURCE_LABELS, eur, isClosedStage, isWonStage } from '@/components/crm/stages';

// Kopfbereich der Deal-Detailansicht: Titel + Kennzahlen links,
// Phase und Hauptaktionen klar getrennt rechts, Nebenaktionen im Menü.
export default function DealDetailHeader({ deal, onEdit, onClose, onReopen, onDelete, onStageChange, onRefresh }) {
  const config = PIPELINES[deal.pipeline];
  const closed = isClosedStage(deal.stage);
  const won = isWonStage(deal.stage);

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="px-4 pt-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 h-7 px-2 text-xs text-muted-foreground" asChild>
          <Link to="/crm"><ArrowLeft className="w-3.5 h-3.5" /> Zurück zur Pipeline</Link>
        </Button>
      </div>

      <div className="px-4 pb-4 pt-2 flex flex-col lg:flex-row lg:items-start gap-4">
        {/* Identität */}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">{deal.title}</h1>
          {deal.company_name && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Building2 className="w-3.5 h-3.5" /> {deal.company_name}
              {deal.contact_name && <span>· {deal.contact_name}</span>}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <Badge variant="outline" className="text-[10px] border-0 bg-secondary text-secondary-foreground">{config.label}</Badge>
            <Badge variant="outline" className="text-[10px] border-0 bg-secondary text-secondary-foreground">
              Quelle: {SOURCE_LABELS[deal.source] || deal.source}
            </Badge>
            {closed && (
              <Badge variant="outline" className={`text-[10px] border-0 ${won ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-700'}`}>
                {STAGE_LABELS[deal.stage]}{deal.closed_at ? ` am ${new Date(deal.closed_at).toLocaleDateString('de-AT')}` : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* Wert */}
        {deal.value_net > 0 && (
          <div className="lg:text-right lg:px-4 lg:border-l shrink-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Auftragswert netto</p>
            <p className="text-xl font-bold tabular-nums">{eur(deal.value_net)}</p>
            <p className="text-[11px] text-muted-foreground">{deal.probability_percent}% Wahrscheinlichkeit</p>
          </div>
        )}

        {/* Steuerung */}
        <div className="shrink-0 space-y-2 lg:w-64">
          {closed ? (
            <div className={`rounded-lg p-2.5 text-xs ${won ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {deal.lost_reason && <p className="mb-2">Grund: {deal.lost_reason}</p>}
              <Button size="sm" variant="outline" className="w-full gap-1.5 bg-background" onClick={onReopen}>
                <RotateCcw className="w-3.5 h-3.5" /> Wieder öffnen
              </Button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Phase</p>
                <Select value={deal.stage} onValueChange={onStageChange}>
                  <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {config.stages.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Verknüpftes Angebot? Dann führt nur die Angebotskarte weiter — kein zweites Angebot aus Versehen. */}
              {!deal.proposal_id && !deal.quote_id && <ProposalHandoffButton deal={deal} onDone={onRefresh} />}
            </>
          )}

          <div className="flex gap-2">
            {!closed && (
              <>
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => onClose('won')}>
                  <Trophy className="w-3.5 h-3.5" /> Gewonnen
                </Button>
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => onClose('lost')}>
                  <XCircle className="w-3.5 h-3.5" /> Verloren
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="px-2"><MoreHorizontal className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit} className="gap-2"><Pencil className="w-3.5 h-3.5" /> Deal bearbeiten</DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="gap-2 text-red-600 focus:text-red-600"><Trash2 className="w-3.5 h-3.5" /> Deal löschen</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}