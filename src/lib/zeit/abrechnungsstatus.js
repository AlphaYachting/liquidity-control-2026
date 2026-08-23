import { base44 } from '@/api/base44Client';

// Wird eine Abrechnungsanweisung erzeugt, gelten die verrechenbaren offenen
// Stunden dieses Projekts bis zum Stichtag als fakturiert.
export async function schliesseZeitenAb({ projectId, instructionId, stichtag }) {
  if (!projectId || !instructionId) return 0;
  const grenze = stichtag || new Date().toISOString().slice(0, 10);
  const offene = await base44.entities.TimeEntry.filter(
    { project_id: projectId, abrechnungsstatus: 'offen', verrechenbar: true },
    '-entry_date',
    500,
  );
  const betroffen = offene.filter((e) => String(e.entry_date || '') <= grenze);
  if (!betroffen.length) return 0;
  await base44.entities.TimeEntry.bulkUpdate(betroffen.map((e) => ({
    id: e.id,
    abrechnungsstatus: 'abgerechnet',
    billing_instruction_id: instructionId,
    abgerechnet_am: new Date().toISOString(),
  })));
  return betroffen.length;
}