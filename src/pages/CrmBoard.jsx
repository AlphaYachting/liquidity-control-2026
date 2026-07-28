import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Inbox, Trophy, XCircle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import DealCard from '@/components/crm/DealCard';
import DealFormDialog from '@/components/crm/DealFormDialog';
import { PIPELINES, eur, isClosedStage } from '@/components/crm/stages';
import { Link } from 'react-router-dom';

export default function CrmBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pipeline, setPipeline] = useState('new_business');
  const [formOpen, setFormOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(null);

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['crm-deals'],
    queryFn: () => base44.entities.CrmDeal.list('-updated_date', 500),
  });
  const { data: inboxItems = [] } = useQuery({
    queryKey: ['crm-inbox-count'],
    queryFn: () => base44.entities.CrmInboxItem.filter({ status: 'new' }, '-created_date', 100),
  });

  const config = PIPELINES[pipeline];
  const pipelineDeals = deals.filter(d => d.pipeline === pipeline);
  const openDeals = pipelineDeals.filter(d => !isClosedStage(d.stage));
  const wonDeals = pipelineDeals.filter(d => d.stage === config.wonStage);
  const lostDeals = pipelineDeals.filter(d => d.stage === config.lostStage);
  const pipelineValue = openDeals.reduce((s, d) => s + (d.value_net || 0), 0);
  const weightedValue = openDeals.reduce((s, d) => s + (d.value_net || 0) * (d.probability_percent || 0) / 100, 0);

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const dealId = result.draggableId;
    const newStage = result.destination.droppableId;
    if (result.source.droppableId === newStage) return;
    queryClient.setQueryData(['crm-deals'], (old = []) =>
      old.map(d => d.id === dealId ? { ...d, stage: newStage } : d));
    await base44.entities.CrmDeal.update(dealId, { stage: newStage });
    queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="CRM — Pipeline"
        subtitle="Neukunden-Leads und Bestandskunden-Anfragen"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2 relative" asChild>
              <Link to="/crm/inbox">
                <Inbox className="w-4 h-4" /> Posteingang
                {inboxItems.length > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-semibold flex items-center justify-center">
                    {inboxItems.length}
                  </span>
                )}
              </Link>
            </Button>
            <Button className="gap-2" onClick={() => setFormOpen(true)}>
              <Plus className="w-4 h-4" /> Neuer Deal
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={pipeline} onValueChange={setPipeline}>
          <TabsList>
            {['new_business', 'existing_customer'].map(p => {
              const newCount = deals.filter(d => d.pipeline === p && !d.seen_at && !isClosedStage(d.stage)).length;
              return (
                <TabsTrigger key={p} value={p} className="gap-1.5">
                  {PIPELINES[p].label}
                  {newCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {newCount}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <div className="flex gap-2 text-xs ml-auto">
          <span className="px-2.5 py-1.5 rounded-lg bg-card border font-medium">
            {openDeals.length} offen · <strong>{eur(pipelineValue)}</strong>
          </span>
          <span className="px-2.5 py-1.5 rounded-lg bg-card border font-medium text-muted-foreground">
            Gewichtet: {eur(weightedValue)}
          </span>
          <button
            onClick={() => setShowClosed(showClosed === 'won' ? null : 'won')}
            className={`px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium flex items-center gap-1 hover:bg-emerald-100 transition-colors ${showClosed === 'won' ? 'ring-2 ring-emerald-300' : ''}`}
          >
            <Trophy className="w-3 h-3" /> {wonDeals.length}
          </button>
          <button
            onClick={() => setShowClosed(showClosed === 'lost' ? null : 'lost')}
            className={`px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 font-medium flex items-center gap-1 hover:bg-red-100 transition-colors ${showClosed === 'lost' ? 'ring-2 ring-red-300' : ''}`}
          >
            <XCircle className="w-3 h-3" /> {lostDeals.length}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Pipeline lädt…</p>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {config.stages.map(stage => {
              const stageDeals = openDeals.filter(d => d.stage === stage.key);
              const stageValue = stageDeals.reduce((s, d) => s + (d.value_net || 0), 0);
              return (
                <div key={stage.key} className="w-64 shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stage.color}`}>
                      {stage.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {stageDeals.length}{stageValue > 0 ? ` · ${eur(stageValue)}` : ''}
                    </span>
                  </div>
                  <Droppable droppableId={stage.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-2 min-h-[120px] rounded-xl p-1.5 transition-colors ${
                          snapshot.isDraggingOver ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-muted/40'
                        }`}
                      >
                        {stageDeals.map((deal, idx) => (
                          <Draggable key={deal.id} draggableId={deal.id} index={idx} disableInteractiveElementBlocking>
                            {(dragProvided) => (
                              <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}>
                                <DealCard deal={deal} onClick={() => navigate(`/crm/deals/${deal.id}`)} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {showClosed && (
        <div className="border rounded-xl bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">
            {showClosed === 'won' ? '🏆 Gewonnene Deals' : '❌ Verlorene Deals'}
          </h3>
          {(showClosed === 'won' ? wonDeals : lostDeals).length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch keine Einträge.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {(showClosed === 'won' ? wonDeals : lostDeals).map(d => (
                <DealCard key={d.id} deal={d} onClick={() => navigate(`/crm/deals/${d.id}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      <DealFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialData={{ pipeline }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['crm-deals'] })}
      />
    </div>
  );
}