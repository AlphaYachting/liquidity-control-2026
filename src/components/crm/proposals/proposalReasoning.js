import { base44 } from '@/api/base44Client';
import { loadSkillRules, loadConfigTemplate } from '@/components/crm/proposals/skillLoader';
import { loadLargeText } from '@/components/crm/proposals/jsonFields';

const MODEL = 'claude_sonnet_4_6';

function contextBlock(p) {
  return `KUNDENKONTEXT-BLOCK (Stammdaten aus dem CRM):
- Firma: ${p.customer_company || '—'}
- Ansprechpartner: ${p.contact_person || '—'}
- Kernbusiness: ${p.client_core_business || '—'}
- Branche: ${p.client_industry || '—'}
- Zielgruppe: ${p.client_target_audience || '—'}
- USP: ${p.client_usp || '—'}
- Bestehendes Marketing: ${p.client_existing_marketing || '—'}
- Projektumfang (IN / NICHT IN): ${p.client_project_scope || '—'}
- Modus: ${p.mode === 'short' ? 'Kurzform (rittler-angebote-short)' : 'Vollversion (rittler-angebote)'}
- Sprint: ${p.sprint_mode ? 'JA (SPRINT_MODE=True)' : 'NEIN (klassisch)'}
- Signatur: ${p.signed_by || 'Alfons Rittler'}`;
}

async function baseParts(proposal) {
  const [rules, notes] = await Promise.all([
    loadSkillRules(proposal.mode),
    loadLargeText(proposal, 'input_text'),
  ]);
  return { rules, notes };
}

const header = (p) => `Du bist der Angebots-Skill "${p.mode === 'short' ? 'rittler-angebote-short' : 'rittler-angebote'}" von Rittler & Co. Es folgen die verbindlichen Regelwerke (SKILL.md + Referenzdateien). Halte dich strikt an alle Regeln, Standing Rules und Freigabe-Stopps. Antworte auf Deutsch.`;

export async function runAnalysis(proposal) {
  const { rules, notes } = await baseParts(proposal);
  const correction = proposal.analysis_correction
    ? `\n\nKORREKTUR DES MITARBEITERS (verbindlich einarbeiten):\n${proposal.analysis_correction}`
    : '';
  return base44.integrations.Core.InvokeLLM({
    model: MODEL,
    prompt: `${header(proposal)}

${rules}

${contextBlock(proposal)}

GESPRÄCHSNOTIZEN:
"""
${notes}
"""${correction}

AUFGABE — Step 2 des Skills (Strategische Analyse & Gap-Analyse):
1. Strategische Einordnung: Projekttyp, Zielhierarchie, Komplexitätsgrad.
2. Gap-Analyse gegen references/strategic-checklist.md als Tabelle (Thema / Im Gespräch? / Im Angebot? / Handlung).
3. Angebotsformat-Empfehlung mit Begründung.
4. Offene Fragen, die vor dem Mapping geklärt werden sollten.
ERSTELLE NOCH KEINE Positionen und KEIN PDF — nur die Analyse zur Freigabe.`,
    response_json_schema: {
      type: 'object',
      properties: {
        project_type: { type: 'string' },
        goal_hierarchy: { type: 'string' },
        complexity: { type: 'string' },
        gap_rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              topic: { type: 'string' },
              in_conversation: { type: 'string' },
              in_proposal: { type: 'string' },
              action: { type: 'string' },
            },
          },
        },
        recommended_format: { type: 'string' },
        format_reasoning: { type: 'string' },
        open_questions: { type: 'array', items: { type: 'string' } },
      },
    },
  });
}

export async function runMapping(proposal, analysis) {
  const { rules, notes } = await baseParts(proposal);
  const correction = proposal.mapping_correction
    ? `\n\nKORREKTUR DES MITARBEITERS (verbindlich einarbeiten):\n${proposal.mapping_correction}`
    : '';
  return base44.integrations.Core.InvokeLLM({
    model: MODEL,
    prompt: `${header(proposal)}

${rules}

${contextBlock(proposal)}

GESPRÄCHSNOTIZEN:
"""
${notes}
"""

FREIGEGEBENE STRATEGISCHE ANALYSE (Stopp 1 bestätigt):
${JSON.stringify(analysis, null, 2)}${correction}

AUFGABE — Step 3 des Skills (Gesprächs-Mapping & Positionsabstimmung):
1. Gesprächs-Mapping-Tabelle: jede geplante Position einer konkreten Aussage aus dem Gespräch zuordnen; Positionen aus der Gap-Analyse mit Quelle "Gap-Analyse" kennzeichnen. Nichts erfinden.
2. Gegencheck: Was ist NICHT im Angebot und warum.
3. Vollständige Positionen im Format des empfohlenen Angebotsformats mit Preisvorschlag (sales-rules.md Regel 12 für Kalkulation, Retainer-Pflicht beachten).
4. Preisübersicht mit Summe netto und brutto (20% USt.).
NOCH KEIN PDF — diese Übersicht geht zur Freigabe (Stopp 2).`,
    response_json_schema: {
      type: 'object',
      properties: {
        mapping_rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              statement: { type: 'string', description: 'Aussage im Gespräch oder Gap-Analyse-Quelle' },
              position: { type: 'string' },
            },
          },
        },
        excluded_rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { point: { type: 'string' }, reason: { type: 'string' } },
          },
        },
        positions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              goal: { type: 'string' },
              items: { type: 'array', items: { type: 'string' } },
              result: { type: 'string' },
              price: { type: 'string' },
              price_suffix: { type: 'string' },
              optional: { type: 'boolean' },
            },
          },
        },
        total_net: { type: 'string' },
        total_gross: { type: 'string' },
        notes: { type: 'string' },
      },
    },
  });
}

export async function runConfig(proposal, analysis, mapping) {
  const [{ rules, notes }, template] = await Promise.all([
    baseParts(proposal),
    loadConfigTemplate(proposal.mode),
  ]);
  const result = await base44.integrations.Core.InvokeLLM({
    model: MODEL,
    prompt: `${header(proposal)}

${rules}

CONFIG-TEMPLATE (client_config${proposal.mode === 'short' ? '_short' : ''}_template.py — die Feldnamen und Strukturen sind verbindlich):
"""
${template}
"""

${contextBlock(proposal)}

GESPRÄCHSNOTIZEN:
"""
${notes}
"""

FREIGEGEBENE ANALYSE (Stopp 1):
${JSON.stringify(analysis, null, 2)}

FREIGEGEBENES MAPPING & POSITIONEN (Stopp 2):
${JSON.stringify(mapping, null, 2)}

AUFGABE — Step 4 des Skills: Erzeuge die FINALE Config als JSON-Objekt im Feld "config".
- Schlüssel = Feldnamen der client_config (CLIENT_NAME, CLIENT_COMPANY, PROPOSAL_TITLE_LINES, VORAB_TEXT, POSITIONS, PRICE_ROWS, TOTAL_NET, TOTAL_GROSS, RESULTS, TIMELINE, TOC, ...).
- Python-Tupel als JSON-Arrays, None als null, alle Texte final und in Consulting-Qualität gemäß text-quality-rules.md und text-templates.md.
- SPRINT_MODE = ${proposal.sprint_mode ? 'true (alle SPRINT_*-Felder befüllen gemäß sprint-rules.md)' : 'false'}.
- SIGNED_BY = "${proposal.signed_by || 'Alfons Rittler'}".
- Standing Rules strikt beachten (® direkt hinter rittler&co, mittleres Paket nie "empfohlen", Preise grün, PROPOSAL_DATE = ${new Date().toLocaleDateString('de-AT')}).`,
    response_json_schema: {
      type: 'object',
      properties: {
        config: { type: 'object', additionalProperties: true, description: 'Finale client_config als JSON' },
      },
    },
  });
  return result.config || result;
}