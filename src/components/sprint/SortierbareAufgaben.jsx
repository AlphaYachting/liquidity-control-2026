import React, { useEffect, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';

// Per Drag-and-Drop sortierbare Aufgabenliste — speichert die Reihenfolge im Feld order
export default function SortierbareAufgaben({ id, tickets, renderZeile }) {
  const [liste, setListe] = useState(tickets);
  const schluessel = tickets.map((t) => `${t.id}:${t.order}:${t.status}:${t.planned_for}:${t.assignee_email}`).join('|');
  useEffect(() => { setListe(tickets); }, [schluessel]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDragEnd = async ({ source, destination }) => {
    if (!destination || source.index === destination.index) return;
    const neu = [...liste];
    const [el] = neu.splice(source.index, 1);
    neu.splice(destination.index, 0, el);
    const mitOrder = neu.map((t, i) => ({ ...t, order: i + 1 }));
    setListe(mitOrder);
    await base44.entities.Ticket.bulkUpdate(mitOrder.map((t) => ({ id: t.id, order: t.order })));
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId={id}>
        {(p) => (
          <div ref={p.innerRef} {...p.droppableProps}>
            {liste.map((t, i) => (
              <Draggable key={t.id} draggableId={t.id} index={i}>
                {(d, s) => (
                  <div ref={d.innerRef} {...d.draggableProps} className={`flex items-stretch bg-card ${s.isDragging ? 'shadow-lg' : ''}`}>
                    <div {...d.dragHandleProps} title="Ziehen zum Sortieren" className="flex items-center px-1 text-muted-foreground/50 hover:text-muted-foreground cursor-grab">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">{renderZeile(t)}</div>
                  </div>
                )}
              </Draggable>
            ))}
            {p.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}