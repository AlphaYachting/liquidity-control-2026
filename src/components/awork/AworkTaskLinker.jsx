import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, List, CheckSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const STATUS_COLOR = {
  done: 'bg-emerald-100 text-emerald-700',
  blocked: 'bg-red-100 text-red-700',
  progress: 'bg-blue-100 text-blue-700',
  open: 'bg-gray-100 text-gray-600',
  unknown: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL = {
  done: 'Erledigt', blocked: 'Blockiert', progress: 'In Bearbeitung',
  open: 'Offen', unknown: 'Unbekannt'
};

export default function AworkTaskLinker({ open, onClose, billingBlock, aworkProjectId, onSave }) {
  const [mode, setMode] = useState('task_list');
  const [selectedListId, setSelectedListId] = useState(billingBlock?.awork_task_list_id || '');
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => {
    try { return JSON.parse(billingBlock?.awork_task_ids || '[]'); } catch { return []; }
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['awork-tasks', aworkProjectId],
    queryFn: () => base44.entities.AworkTaskSnapshot.filter({ awork_project_id: aworkProjectId }),
    enabled: open && !!aworkProjectId
  });

  const tasksByList = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      const listKey = t.task_list_id || '__ungrouped__';
      const listName = t.task_list_name || 'Ungrupiert';
      if (!map[listKey]) map[listKey] = { id: listKey, name: listName, tasks: [] };
      map[listKey].tasks.push(t);
    }
    return Object.values(map);
  }, [tasks]);

  const toggleTask = (taskId) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const handleSave = () => {
    if (mode === 'task_list') {
      const list = tasksByList.find(l => l.id === selectedListId);
      onSave({
        awork_mapping_type: 'task_list',
        awork_task_list_id: selectedListId,
        awork_task_list_name: list?.name || '',
        awork_task_ids: '[]'
      });
    } else {
      onSave({
        awork_mapping_type: 'tasks',
        awork_task_ids: JSON.stringify(selectedTaskIds),
        awork_task_list_id: '',
        awork_task_list_name: ''
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>awork Aufgaben verknüpfen — {billingBlock?.title}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Lade Aufgaben...
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Keine Aufgaben gefunden. Bitte zuerst awork Sync durchführen.
          </p>
        ) : (
          <Tabs value={mode} onValueChange={setMode} className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-full">
              <TabsTrigger value="task_list" className="flex-1 gap-2">
                <List className="w-4 h-4" /> Aufgabenliste verknüpfen
              </TabsTrigger>
              <TabsTrigger value="tasks" className="flex-1 gap-2">
                <CheckSquare className="w-4 h-4" /> Aufgaben auswählen
              </TabsTrigger>
            </TabsList>

            <TabsContent value="task_list" className="flex-1 overflow-y-auto space-y-2 mt-2">
              <p className="text-xs text-muted-foreground mb-2">
                Alle Aufgaben der gewählten Liste werden für den Fortschritt verwendet.
              </p>
              {tasksByList.map(list => (
                <button
                  key={list.id}
                  onClick={() => setSelectedListId(list.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedListId === list.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{list.name}</span>
                    <span className="text-xs text-muted-foreground">{list.tasks.length} Aufgaben</span>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-emerald-600">
                      {list.tasks.filter(t => t.is_done).length} erledigt
                    </span>
                    <span className="text-xs text-red-600">
                      {list.tasks.filter(t => t.is_blocked).length} blockiert
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {list.tasks.filter(t => !t.is_done && !t.is_blocked).length} offen
                    </span>
                  </div>
                </button>
              ))}
            </TabsContent>

            <TabsContent value="tasks" className="flex-1 overflow-y-auto mt-2">
              <p className="text-xs text-muted-foreground mb-2">
                Nur die ausgewählten Aufgaben werden für den Fortschritt verwendet.
                ({selectedTaskIds.length} ausgewählt)
              </p>
              {tasksByList.map(list => (
                <div key={list.id} className="mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-1">
                    {list.name}
                  </p>
                  <div className="space-y-1">
                    {list.tasks.map(task => (
                      <label
                        key={task.id}
                        className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedTaskIds.includes(task.awork_task_id)}
                          onCheckedChange={() => toggleTask(task.awork_task_id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${task.is_done ? 'line-through text-muted-foreground' : ''}`}>
                            {task.task_title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLOR[task.task_status_type]}`}>
                              {STATUS_LABEL[task.task_status_type]}
                            </span>
                            {task.assignee_name && (
                              <span className="text-xs text-muted-foreground">{task.assignee_name}</span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-between pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={
            (mode === 'task_list' && !selectedListId) ||
            (mode === 'tasks' && selectedTaskIds.length === 0)
          }>
            Verknüpfung speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}