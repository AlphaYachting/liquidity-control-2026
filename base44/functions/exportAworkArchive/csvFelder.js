// Lesefassung: flache CSV-Spalten je Objektart. Die JSONL bleibt die Wahrheit.
const BOM = '\uFEFF';

const feld = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
};

export function csvBauen(spalten, rows, mapper) {
  const zeilen = [spalten.join(';')];
  for (const r of rows) {
    const flach = mapper(r);
    zeilen.push(spalten.map((s) => feld(flach[s])).join(';'));
  }
  return BOM + zeilen.join('\r\n') + '\r\n';
}

const name = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '');
const min = (sek) => (typeof sek === 'number' ? Math.round(sek / 60) : '');

export const TIMEENTRY_SPALTEN = ['id', 'projectId', 'projectName', 'taskId', 'taskName', 'userId', 'userName',
  'typeOfWork', 'startDateLocal', 'startTimeLocal', 'endTimeLocal', 'durationMinutes', 'isBillable', 'isBilled', 'note'];

export const timeentryMap = (e) => ({
  id: e.id,
  projectId: e.projectId || e.task?.project?.id || '',
  projectName: e.task?.project?.name || e.project?.name || '',
  taskId: e.taskId || '',
  taskName: e.task?.name || '',
  userId: e.userId || '',
  userName: name(e.user),
  typeOfWork: e.typeOfWork?.name || '',
  startDateLocal: e.startDateLocal || '',
  startTimeLocal: e.startTimeLocal || '',
  endTimeLocal: e.endTimeLocal || '',
  durationMinutes: min(e.duration),
  isBillable: e.isBillable,
  isBilled: e.isBilled,
  note: e.note || '',
});

export const TASK_SPALTEN = ['id', 'projectId', 'projectName', 'taskList', 'name', 'statusName', 'statusType',
  'assignees', 'dueOn', 'plannedMinutes', 'trackedMinutes', 'commentCount', 'checklistItemsCount', 'tags'];

export const taskMap = (t) => ({
  id: t.id,
  projectId: t.projectId || t.project?.id || '',
  projectName: t.project?.name || t._projectName || '',
  taskList: t.taskList?.name || t.taskListName || '',
  name: t.name || '',
  statusName: t.taskStatus?.name || '',
  statusType: t.taskStatus?.type || '',
  assignees: (t.assignees || []).map(name).filter(Boolean).join(', '),
  dueOn: t.dueOn || '',
  plannedMinutes: min(t.plannedDuration),
  trackedMinutes: min(t.trackedDuration),
  commentCount: t.commentCount ?? '',
  checklistItemsCount: t.checklistItemsCount ?? '',
  tags: (t.tags || []).map((x) => x.name || x).join(', '),
});

export const COMMENT_SPALTEN = ['id', 'entityType', 'projectId', 'taskId', 'createdOn', 'userName', 'plainFormattedMessage'];

export const commentMap = (c) => ({
  id: c.id,
  entityType: c._entityType || c.entityType || '',
  projectId: c._projectId || '',
  taskId: c._taskId || '',
  createdOn: c.createdOn || '',
  userName: name(c.user) || c.createdBy || '',
  plainFormattedMessage: c.plainFormattedMessage || c.message || '',
});

export const PROJECT_SPALTEN = ['id', 'name', 'companyName', 'projectStatus', 'projectType', 'createdOn', 'dueDate', 'timeBudgetMinutes'];

export const projectMap = (p) => ({
  id: p.id,
  name: p.name || '',
  companyName: p.company?.name || '',
  projectStatus: p.projectStatus?.name || '',
  projectType: p.projectType?.name || '',
  createdOn: p.createdOn || '',
  dueDate: p.dueDate || '',
  timeBudgetMinutes: min(p.timeBudget),
});