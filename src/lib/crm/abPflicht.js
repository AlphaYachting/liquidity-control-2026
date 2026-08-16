// Entscheidet, ob für einen gewonnenen Deal eine Auftragsbestätigung (AB) nötig ist.
export const AB_SCHWELLE = 1500;

export const isRenderedProposal = (proposal) =>
  Boolean(proposal && (proposal.status === 'rendered' || proposal.pdf_url));

export function computeAbPflicht({ deal, proposal, hasPreviousOrders }) {
  const value = Number(deal?.value_net) || 0;

  if (deal?.proposal_id && isRenderedProposal(proposal)) {
    return { required: true, origin: 'studio', reason: 'Angebot aus dem Studio — Auftragsbestätigung immer nötig.' };
  }

  const neukunde = !hasPreviousOrders;
  if (value > AB_SCHWELLE || neukunde) {
    return {
      required: true,
      origin: 'adhoc',
      reason: [
        value > AB_SCHWELLE ? `Auftragswert über ${AB_SCHWELLE} €` : null,
        neukunde ? 'Neukunde ohne bisherigen Auftrag' : null,
      ].filter(Boolean).join(' · '),
    };
  }

  return {
    required: false,
    origin: 'adhoc',
    reason: 'Kleiner Zuruf eines Bestandskunden — läuft auf Regie, keine Auftragsbestätigung.',
  };
}