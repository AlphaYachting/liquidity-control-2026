// Die Rechnung in sevDesk führt — alles andere folgt.
// sevDesk-Belegstatus → Status der Abrechnungsanweisung → Status der verknüpften
// Verrechnungsplanung (MonthlyBillingPlan). Eine Regel für Morgenlauf,
// 6-Stunden-Lauf und Live-Abgleich, damit kein Weg anders rechnet.
//
// Geschrieben wird nur der Status. Beträge, Verknüpfungen und Monate bleiben
// unberührt — das sind inhaltliche Entscheidungen eines Menschen.

export const VERRECHNET = ['invoice_created', 'paid'];

// sevDesk-Belegstatus → Status der Abrechnungsanweisung.
// 100 = Entwurf: der Beleg ist NICHT verrechnet, die Anweisung liegt beim Backoffice.
export function statusAusSevdesk(sevStatus) {
  const s = String(sevStatus || '');
  if (s === '1000') return 'paid';
  if (s === '750' || s === '300') return 'invoice_created';
  if (s === '50') return 'cancelled';
  if (s === '100') return 'sent_to_backoffice';
  return 'invoice_created';
}

// Seitenweise laden — ein einzelner Aufruf liefert nicht beliebig viele Zeilen.
export async function alleSeiten(holen, seite = 500) {
  const alle = [];
  let skip = 0;
  while (true) {
    const page = (await holen(seite, skip)) || [];
    alle.push(...page);
    if (page.length < seite || skip > 20000) break;
    skip += seite;
  }
  return alle;
}

// Verrechnungsplanung folgt ihrer Anweisung.
// Vorwärts: Anweisung verrechnet oder bezahlt → Planung „verrechnet“.
// Rückwärts nur bei einem echten Rückfall (vorher verrechnet, jetzt nicht mehr,
// z. B. Rechnung in sevDesk storniert oder Entwurf gelöscht): eine Planung, die
// auf „verrechnet“ steht, wird wieder „geplant“. Andere Planungsstände
// (verschoben, on hold …) werden nie überschrieben.
export async function planFolgtAnweisung(db, instrId, neuerStatus, alterStatus) {
  if (!instrId || !neuerStatus) return 0;
  const vorwaerts = VERRECHNET.includes(neuerStatus);
  const rueckfall = !vorwaerts && VERRECHNET.includes(alterStatus);
  if (!vorwaerts && !rueckfall) return 0;

  const plaene = await db.MonthlyBillingPlan.filter({ linked_billing_instruction_id: instrId }, '-created_date', 50);
  let geaendert = 0;
  for (const p of plaene) {
    if (vorwaerts && p.billing_status !== 'invoiced') {
      await db.MonthlyBillingPlan.update(p.id, { billing_status: 'invoiced' });
      geaendert++;
    } else if (rueckfall && p.billing_status === 'invoiced') {
      await db.MonthlyBillingPlan.update(p.id, { billing_status: 'planned' });
      geaendert++;
    }
  }
  return geaendert;
}

// Anweisung auf den Soll-Status setzen (nur Status, nie Betrag) und die Planung nachziehen.
// Liefert true, wenn etwas geändert wurde.
export async function anweisungAngleichen(db, instr, sollStatus, extra = {}) {
  if (!instr || !sollStatus || sollStatus === instr.status) return false;
  const patch = { status: sollStatus, ...extra };
  if (sollStatus === 'invoice_created' && !instr.invoice_created_at) {
    patch.invoice_created_at = new Date().toISOString();
  }
  await db.BillingInstruction.update(instr.id, patch);
  await planFolgtAnweisung(db, instr.id, sollStatus, instr.status);
  return true;
}
