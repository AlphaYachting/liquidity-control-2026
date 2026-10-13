// Zahlstand älterer Rechnungen nachziehen.
// Der 6-Stunden-Lauf liest nur die 50 neuesten sevDesk-Rechnungen — ältere, die in der
// App noch als offen geführt werden, frieren sonst ein (z. B. bezahlt in sevDesk,
// in der App weiter „offen“). Hier: zwei Listenabrufe (offen, teilbezahlt) und nur
// für Rechnungen, die dort fehlen, ein Einzelabruf.
// Geschrieben werden ausschließlich Zahlungsfelder — nie Zuordnung, Projekt oder Betrag.
import { sevdeskGet, zahlfelder, fetchPaidAmount, parseAmount } from './sevdeskRechnung.js';
import { alleSeiten } from './billingFollow.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gleich = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;

async function offeneAusSevdesk(apiKey) {
  const map = new Map();
  for (const status of [200, 750]) {
    let offset = 0;
    for (let runde = 0; runde < 50; runde++) {
      const page = await sevdeskGet(`/Invoice?limit=100&offset=${offset}&status=${status}`, apiKey);
      const items = page.objects || [];
      for (const inv of items) map.set(String(inv.id), inv);
      if (items.length < 100) break;
      offset += 100;
      await sleep(250);
    }
  }
  return map;
}

export async function zahlstandNachziehen({
  db, apiKey, gesehen = new Set(), erlaubteJahre = [2025, 2026], nurPruefen = false, maxEinzelabrufe = 40,
}) {
  const offenInApp = await alleSeiten((l, s) => db.InvoiceRecord.filter(
    { source_type: 'sevdesk', payment_status: { $in: ['open', 'partially_paid', 'overdue'] } },
    '-invoice_date', l, s,
  ));
  const kandidaten = offenInApp.filter((r) => r.sevdesk_id
    && !gesehen.has(String(r.sevdesk_id))
    && erlaubteJahre.some((y) => String(r.invoice_date || '').startsWith(String(y))));
  if (kandidaten.length === 0) return { geprueft: 0, einzelabrufe: 0, geaendert: [], nicht_gefunden: [], vertagt: 0 };

  const offen = await offeneAusSevdesk(apiKey);
  const geaendert = [];
  const nichtGefunden = [];
  let einzelabrufe = 0;
  let vertagt = 0;

  for (const r of kandidaten) {
    const sid = String(r.sevdesk_id);
    let inv = offen.get(sid) || null;
    if (!inv) {
      if (einzelabrufe >= maxEinzelabrufe) { vertagt++; continue; } // Rest beim nächsten Lauf
      einzelabrufe++;
      try {
        const d = await sevdeskGet(`/Invoice/${sid}`, apiKey);
        inv = Array.isArray(d.objects) ? d.objects[0] : d.objects || null;
      } catch (_e) {
        inv = null;
      }
      await sleep(250);
      // Beleg fehlt in sevDesk: nichts anfassen, nur melden — das ist eine Entscheidung.
      if (!inv) { nichtGefunden.push({ id: r.id, rechnung: r.invoice_number || '', kunde: r.customer_name || '' }); continue; }
    }

    let felder = zahlfelder(inv);
    if (felder.payment_status === 'partially_paid') {
      // Wie im 6-Stunden-Lauf: Teilzahlungen einzeln nachrechnen.
      const { paid, open } = await fetchPaidAmount(sid, parseAmount(inv.sumGross), apiKey);
      felder = { ...felder, paid_amount: paid, open_amount: open };
      await sleep(300);
    }

    // „überfällig“ kennt sevDesk nicht als eigenen Status — wer in der App so geführt
    // wird und in sevDesk noch offen ist, bleibt überfällig.
    if (r.payment_status === 'overdue' && felder.payment_status === 'open') {
      felder = { ...felder, payment_status: 'overdue' };
    }
    const anders = felder.payment_status !== r.payment_status
      || !gleich(felder.paid_amount, r.paid_amount)
      || !gleich(felder.open_amount, r.open_amount)
      || (felder.payment_date || null) !== (r.payment_date || null);
    if (!anders) continue;

    geaendert.push({
      id: r.id, rechnung: r.invoice_number || '', kunde: r.customer_name || '',
      vorher: r.payment_status, nachher: felder.payment_status,
      offen_vorher: Number(r.open_amount) || 0, offen_nachher: felder.open_amount,
    });
    if (!nurPruefen) await db.InvoiceRecord.update(r.id, felder);
  }

  return { geprueft: kandidaten.length, einzelabrufe, geaendert, nicht_gefunden: nichtGefunden, vertagt };
}
