import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import TicketZeile from '@/components/sprint/TicketZeile';
import { nachFaelligkeit, laufenderMonat } from '@/lib/sprint/behaelterZahlen';

// Manuelle Reihenfolge (order) zuerst, sonst nach Fälligkeit
const nachReihenfolge = (a, b) => {
  const oa = a.order ?? Infinity;
  const ob = b.order ?? Infinity;
  return oa !== ob ? oa - ob : nachFaelligkeit(a, b);
};

// Aufgabenliste für Support, Intern und Altprojekte — per Drag-and-Drop sortierbar
export default function BehaelterAufgaben({ tickets, matches, members, myEmail, onStatus, onAssignee }) {
  const [erledigtOffen, setErledigtOffen] = useState(false);
  const monat = laufenderMonat();
  const sortiert = tickets.filter((t) => t.status !== 'erledigt' && matches(t)).sort(nachReihenfolge);
  const [offen, setOffen] = useState(sortiert);
  const schluessel = sortiert.map((t) => `${t.id}:${t.order}:${t.status}:${t.planned_for}:${t.assignee_email}`).join('|');
  useEffect(() => { setOffen(sortiert); }, [schluessel]); // eslint-disable-line react-hooks/exhaustive-deps

  const erledigt = tickets.filter((t) => t.status === 'erledigt' && matches(t)
    && (t.last_status_change || t.updated_date || '').startsWith(monat));
  const zeile = (t) => (
    <TicketZeile key={t.id} ticket={t} members={members} currentUserEmail={myEmail} editable onStatus={onStatus} onAssignee={onAssignee} />
  );

  const onDragEnd = async ({ source, destination }) => {
    if (!destination || source.index === destination.index) return;
    const neu = [...offen];
    const [el] = neu.splice(source.index, 1);
    neu.splice(destination.index, 0, el);
    const mitOrder = neu.map((t, i) => ({ ...t, order: i + 1 }));
    setOffen(mitOrder);
    await base44.entities.Ticket.bulkUpdate(mitOrder.map((t) => ({ id: t.id, order: t.order })));
  };

  return (
    <div className="mt-4">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="aufgaben">
          {(p) => (
            <div ref={p.innerRef} {...p.droppableProps}>
              {offen.map((t, i) => (
                <Draggable key={t.id} draggableId={t.id} index={i}>
                  {(d, s) => (
                    <div ref={d.innerRef} {...d.draggableProps} className={`flex items-stretch bg-card ${s.isDragging ? 'shadow-lg' : ''}`}>
                      <div {...d.dragHandleProps} title="Ziehen zum Sortieren" className="flex items-center px-1 text-muted-foreground/50 hover:text-muted-foreground cursor-grab">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">{zeile(t)}</div>
                    </div>
                  )}
                </Draggable>
              ))}
              {p.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      {offen.length === 0 && <p className="text-sm text-muted-foreground py-2">Keine offenen Aufgaben.</p>}
      {erledigt.length > 0 && (
        <div className="mt-3">
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setErledigtOffen(!erledigtOffen)}>
            {erledigtOffen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Erledigt diesen Monat ({erledigt.length})
          </button>
          {erledigtOffen && <div className="mt-1">{erledigt.map(zeile)}</div>}
        </div>
      )}
    </div>
  );
}