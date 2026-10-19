import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Formuliert den Abrechnungsgrund einer geplanten Rechnung (Verrechnungsplanung im Projekt-Cockpit).
// Dieser Text wird über die Abrechnungsanweisung zum POSITIONSTEXT der sevDesk-Rechnung
// (createSevdeskInvoiceDraft: positionText = instr.invoice_reason). Er muss deshalb kurz,
// sachlich und rechnungstauglich sein — keine Prosa.
// Rechnungsart, Prozentsatz und AB-Nummer setzt der Code, nie die KI.

const TYP_LABEL: Record<string, string> = { AZ: 'Anzahlung', TR: 'Teilrechnung', ER: 'Schlussrechnung' };

function referenzZeile(typ: string, prozent: number, abNummer: string): string {
  const pct = prozent > 0 ? ` über ${Math.round(prozent)} % des Auftragsvolumens` : '';
  const nr = (abNummer || '').trim();
  const ab = !nr
    ? 'gemäß Auftragsbestätigung'
    : /^AB/i.test(nr) ? `gemäß ${nr}` : `gemäß Auftragsbestätigung ${nr}`;
  return `${typ}${pct} ${ab}`;
}

// KI-Antwort in reine Rechnungszeilen bringen: kein Markdown, keine Anführungszeichen,
// keine Zeilen mit Prozent- oder AB-Angaben (die ergänzt referenzZeile), höchstens 4 Zeilen.
function bereinige(roh: unknown): string[] {
  const r: any = roh;
  let t = typeof r === 'string' ? r : (r?.text || r?.response || r?.content || '');
  t = String(t).replace(/\r/g, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*•·]\s+/gm, '– ');
  return t.split('\n')
    .map((z: string) => z.trim().replace(/^["„“”‚‘']+|["„“”‚‘']+$/g, '').trim())
    .filter(Boolean)
    .filter((z: string) => !/AB-\d|\d+\s*%/.test(z))
    .slice(0, 4);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    project_id,
    confirmed_order_id,
    planned_percent,
    planned_invoice_type,
    user_reason_hint,
  } = await req.json();

  const userHint = (user_reason_hint || '').trim();
  const typ = TYP_LABEL[planned_invoice_type] || 'Teilrechnung';

  const project = await base44.asServiceRole.entities.LiquidityProject.filter({ id: project_id }).then((r: any[]) => r[0] || null);
  const aworkProjectId = project?.awork_project_id || null;

  const [orders, orderItems, aworkTasks, pastInstructions] = await Promise.all([
    confirmed_order_id
      ? base44.asServiceRole.entities.ConfirmedOrder.filter({ id: confirmed_order_id })
      : base44.asServiceRole.entities.ConfirmedOrder.filter({ project_id }),
    confirmed_order_id
      ? base44.asServiceRole.entities.ConfirmedOrderItem.filter({ confirmed_order_id })
      : Promise.resolve([]),
    // Altbestand nur als Notbehelf, wenn der Projektmanager nichts eingegeben hat
    !userHint && aworkProjectId
      ? base44.asServiceRole.entities.AworkTaskSnapshot.filter({ awork_project_id: aworkProjectId })
      : Promise.resolve([]),
    base44.asServiceRole.entities.BillingInstruction.filter({ project_id }),
  ]);

  const order = orders?.[0] || null;

  const doneTasks = (aworkTasks || [])
    .filter((t: any) => t.is_done || t.task_status_type === 'done')
    .map((t: any) => t.task_title)
    .filter(Boolean)
    .slice(0, 30);

  const prevReasons = (pastInstructions || [])
    .filter((i: any) => i.status !== 'cancelled')
    .map((i: any) => i.invoice_reason)
    .filter(Boolean);

  const arbeitsart = {
    AZ: 'Anzahlung — es ist noch keine Leistung erbracht. Zeile 1 nennt den Auftragsgegenstand, z. B. „Projektstart Website-Relaunch“.',
    TR: 'Teilrechnung — Zeile 1 nennt den abgeschlossenen Leistungsabschnitt.',
    ER: 'Schlussrechnung — Zeile 1 nennt die abschließenden Leistungen bzw. den Projektabschluss, z. B. „Projektabschluss: Livegang und Übergabe Webportal“.',
  }[planned_invoice_type as 'AZ' | 'TR' | 'ER'] || 'Teilrechnung — Zeile 1 nennt den abgeschlossenen Leistungsabschnitt.';

  const prompt = `Du schreibst den Positionstext einer Rechnung einer österreichischen Werbe- und Digitalagentur. Der Text steht in der Rechnung direkt neben dem Betrag und wird vom Kunden gelesen. Er muss in drei Sekunden erfassbar sein.

## Rechnungsart (nur zur Einordnung)
${arbeitsart}

## Angabe des Projektmanagers — VERBINDLICHE GRUNDLAGE
${userHint ? userHint : '(keine Angabe)'}

## Auftrag
- Kunde: ${project?.customer || order?.customer || '–'}
- Projekt: ${project?.project_name || order?.project_name || '–'}
- Auftragsgegenstand laut Auftragsbestätigung: ${order?.description || '–'}
${orderItems?.length > 0
  ? '- Beauftragte Positionen:\n' + orderItems.map((i: any) => `  - ${i.title}${i.description ? ' — ' + i.description : ''}`).join('\n')
  : ''}
${!userHint && doneTasks.length > 0 ? `\n## Erledigte Aufgaben (Altbestand, nur verwenden, weil keine Angabe vorliegt)\n${doneTasks.map((t: string) => `- ${t}`).join('\n')}\n` : ''}
## Bereits abgerechnet (diese Leistungen NICHT noch einmal nennen)
${prevReasons.length > 0 ? prevReasons.map((r: string) => `- ${String(r).replace(/\s+/g, ' ').slice(0, 200)}`).join('\n') : '- noch nichts'}

## Form (zwingend)
- Zeile 1: die abgerechnete Leistung als knappe Bezeichnung mit Ergebnis, höchstens 90 Zeichen, kein ganzer Satz.
- Danach höchstens zwei Zeilen, jede beginnt mit „– “: konkrete Leistungsbestandteile — NUR wenn sie wörtlich oder sinngemäß in der Angabe des Projektmanagers oder in den beauftragten Positionen stehen. Lieber keine Zusatzzeile als eine erfundene.
- Optional eine letzte Zeile, die den Abschnitt dem Auftrag zuordnet: „Leistungsabschnitt aus dem Auftrag <Auftragsgegenstand in Kurzform>“ — nur wenn der Auftragsgegenstand oben bekannt ist.
- Insgesamt höchstens 4 Zeilen.

## Verboten
- Rechnungsart, Prozentsatz, Betrag, Auftragsnummer — diese Zeile ergänzt das System selbst.
- Füllphrasen und Werbesprache, etwa „Mit der vorliegenden Rechnung“, „im Mittelpunkt steht“, „wesentlicher Bestandteil“, „spiegelt den Fortschritt wider“, „kontinuierlich“, „zielgruppengerecht“, „im Rahmen des Gesamtauftrags“.
- Eigenschaften, Zwecke oder Zustände, die nicht in den Angaben stehen (z. B. „für den internationalen Einsatz“, „freigegeben“, „abgenommen“).
- Interna: Stunden, Aufgabenzahlen, Toolnamen, Namen von Mitarbeitenden, offene Punkte.
- Markdown, Anführungszeichen, Überschriften, Erklärungen zum Text.

## Beispiel
Angabe: „Imagebroschüre DE und EN fertig“, Auftragsgegenstand: „Positionierung, Kommunikation, Markenwelt und Webportal“
Ausgabe:
Image-Broschüre Deutsch und Englisch – fertiggestellt
Leistungsabschnitt aus dem Auftrag Positionierung, Kommunikation, Markenwelt und Webportal

Antworte nur mit den Zeilen des Positionstexts.`;

  let zeilen: string[] = [];
  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
    });
    zeilen = bereinige(result);
  } catch (e) {
    console.warn('generateBillingReason: KI nicht erreichbar', e);
  }

  // Ohne verwertbare KI-Antwort bleibt die Eingabe des Projektmanagers stehen
  if (!zeilen.length && userHint) zeilen = [userHint.replace(/\s+/g, ' ')];
  if (!zeilen.length) {
    // Status 200, damit der Knopf seine Fehlermeldung zeigt statt hängen zu bleiben
    return Response.json({ error: 'KI konnte keinen Text generieren.' });
  }

  const text = [...zeilen, referenzZeile(typ, Number(planned_percent) || 0, order?.order_number || '')].join('\n');
  return Response.json({ invoice_reason: text });
});
