import { base44 } from '@/api/base44Client';
import { loadSkillRules } from '@/components/crm/proposals/skillLoader';
import { loadLargeText, unwrapLLM, buildLargeTextPatch } from '@/components/crm/proposals/jsonFields';
import { composeNotes } from '@/components/crm/proposals/sourceDocs';

const MODEL = 'claude_sonnet_4_6';

const EMAIL_SCHEMA = {
  type: 'object',
  properties: {
    positions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          price_net: { type: 'number' },
        },
      },
    },
    total_net: { type: 'number' },
    total_gross: { type: 'number' },
    excluded: { type: 'array', items: { type: 'string' } },
    timeline: { type: 'string' },
    email_body: { type: 'string' },
  },
};

async function getSetting(key, fallback) {
  const rows = await base44.entities.Setting.filter({ key }).catch(() => []);
  return rows[0]?.value ?? fallback;
}

// Typ C — E-Mail-Angebot: EIN KI-Lauf, Ergebnis wird als CrmQuote gespeichert (nicht CrmProposal).
export async function runEmailOffer(proposal, onProgress = () => {}) {
  onProgress('Regelwerk & Gesprächsnotizen werden geladen…');
  const [rules, manual, validityDays] = await Promise.all([
    loadSkillRules('email').catch(() => ''),
    loadLargeText(proposal, 'input_text'),
    getSetting('email_offer_validity_days', '14'),
  ]);
  const notes = await composeNotes(proposal, manual);

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + (parseInt(validityDays, 10) || 14));
  const validIso = `${validUntil.getFullYear()}-${String(validUntil.getMonth() + 1).padStart(2, '0')}-${String(validUntil.getDate()).padStart(2, '0')}`;
  const validLabel = validUntil.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  onProgress('KI erstellt das E-Mail-Angebot (kann 1–2 Minuten dauern)…');
  const raw = await base44.integrations.Core.InvokeLLM({
    model: MODEL,
    prompt: `Du bist der Angebots-Skill "rittler-angebote-email" von Rittler & Co (österreichische Digitalagentur). Erstelle aus dem Gesprächskontext ein E-MAIL-ANGEBOT für einen Bestandskunden — eine strukturierte E-Mail ohne Dokument. Antworte auf Deutsch.
${rules ? `\n${rules}\n` : ''}
KUNDENKONTEXT:
- Firma: ${proposal.customer_company || '—'}
- Ansprechpartner: ${proposal.contact_person || '—'}
- Kernbusiness: ${proposal.client_core_business || '—'}
- Projektumfang (IN / NICHT IN): ${proposal.client_project_scope || '—'}
- Signatur: ${proposal.signed_by || 'Alfons Rittler'}

GESPRÄCHSNOTIZEN & DOKUMENTE:
"""
${notes}
"""

Der Mailtext (email_body) folgt IMMER dieser Gliederung, in genau dieser Reihenfolge:
1. Bezug — EIN Satz auf Gespräch/Anfrage
2. Leistungen — 2–5 Positionen, je Leistung – Ergebnis – Preis netto (maximal 2 Zeilen je Position)
3. Nicht enthalten — 1–3 Zeilen Abgrenzung
4. Summe — netto, 20% USt., brutto
5. Termin — Start und Lieferzeitraum
6. Gültigkeit — exakt dieser Satz: "Dieses Angebot gilt bis ${validLabel}."
7. AGB-Verweis — ein Satz
8. Nächster Schritt — eine konkrete Handlung

Tonalität: "Sie", knapp, keine Werbesprache, keine Superlative.
Format des email_body: KEIN Markdown — keine Sterne (*), keine Rauten (#), keine Trennlinien (---). Zwischenüberschriften als eigene kurze Zeile mit Doppelpunkt am Ende (z.B. "Leistungen:"), Aufzählungen mit "– " (Gedankenstrich).
Verboten: Rabatte, Zusagen, die nicht aus dem Gespräch hervorgehen, Leistungen ohne Preis.

Gib zusätzlich strukturiert zurück: positions[] (title, description, price_net), total_net, total_gross (20% USt.), excluded[] (was NICHT enthalten ist), timeline (Start und Lieferzeitraum).`,
    response_json_schema: EMAIL_SCHEMA,
  });

  onProgress('Ergebnis wird als Angebot gespeichert…');
  const result = unwrapLLM(raw);
  // Quelltext vollständig erhalten — bei langen Notizen als Datei auslagern
  const sourcePatch = await buildLargeTextPatch('source_text', notes, 'angebotsquelle.txt');
  // Empfänger aus dem Deal übernehmen, damit die Mail nicht ohne Adressat öffnet
  const deal = proposal.deal_id
    ? await base44.entities.CrmDeal.get(proposal.deal_id).catch(() => null)
    : null;
  const positions = result?.positions || [];
  const totalNet = result?.total_net || positions.reduce((s, p) => s + (p.price_net || 0), 0);
  const totalGross = result?.total_gross || Math.round(totalNet * 1.2 * 100) / 100;

  return base44.entities.CrmQuote.create({
    deal_id: proposal.deal_id || '',
    title: proposal.title || `E-Mail-Angebot ${proposal.customer_company || ''}`.trim(),
    customer_name: proposal.customer_company || '',
    contact_name: proposal.contact_person || deal?.contact_name || '',
    contact_email: deal?.contact_email || '',
    offer_type: 'email',
    source: 'transcript',
    status: 'draft',
    items: positions.map((p, i) => ({
      position: i + 1,
      title: p.title || '',
      description: p.description || '',
      quantity: 1,
      unit: 'pauschal',
      unit_price: p.price_net || 0,
      total_price: p.price_net || 0,
    })),
    total_net: totalNet,
    vat_rate: 20,
    total_gross: totalGross,
    excluded: result?.excluded || [],
    valid_until: validIso,
    email_body: result?.email_body || '',
    ...sourcePatch,
    notes: result?.timeline ? `Termin: ${result.timeline}` : '',
  });
}