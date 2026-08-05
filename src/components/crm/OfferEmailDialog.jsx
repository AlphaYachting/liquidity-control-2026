import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw, Send, Download } from 'lucide-react';
import { loadJsonField } from '@/components/crm/proposals/jsonFields';

const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Erstellt zwei KI-E-Mail-Varianten (Angebot bzw. Nachfassen), öffnet die gewählte
// Version im E-Mail-Programm und protokolliert sie in der Deal-Historie.
// Zwei Fälle: mit PDF = Anschreiben + Link; ohne PDF = die Mail trägt das Angebot selbst.
export default function OfferEmailDialog({ open, onOpenChange, mode, deal, proposal, lastOfferDate, onSent }) {
  const { user } = useAuth();
  const [variants, setVariants] = useState([]);
  const [selected, setSelected] = useState(0);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeLink, setIncludeLink] = useState(true);
  const [noBasis, setNoBasis] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isFollowup = mode === 'followup';
  const hasPdf = Boolean(proposal.pdf_url);

  const generate = async () => {
    setGenerating(true); setError(null); setVariants([]); setNoBasis(false);
    try {
      const daysSince = lastOfferDate ? Math.floor((Date.now() - new Date(lastOfferDate).getTime()) / 86400000) : null;

      let task;
      if (isFollowup) {
        task = `AUFGABE: Freundliche Nachfass-E-Mail — wir haben vor ${daysSince ?? 'einigen'} Tagen das Angebot "${proposal.title}" übermittelt und noch keine Rückmeldung erhalten. Ziel: unaufdringlich Rückmeldung oder ein kurzes Gespräch anbieten, Mehrwert nochmals in einem Satz betonen.`;
      } else if (hasPdf) {
        // FALL A — Anschreiben zum PDF, ohne Detailpreise; der PDF-Link wird am Ende eingefügt.
        task = `AUFGABE: Anschreiben zur Übermittlung unseres Angebots "${proposal.title}". Kurz auf die Anfrage eingehen, den Nutzen zusammenfassen und zum nächsten Schritt (Rückfrage/Termin) einladen. KEINE Detailpreise in der E-Mail nennen. Erwähne, dass das vollständige Angebot verlinkt bzw. beiliegend ist.`;
      } else {
        // FALL B — kein PDF: die Mail muss das Angebot selbst tragen (Quelle: freigegebenes Mapping).
        const mapping = await loadJsonField(proposal, 'mapping_json').catch(() => null);
        const positions = (mapping?.positions || []).map((p) => ({
          title: p.title, goal: p.goal, result: p.result, price: p.price,
          price_suffix: p.price_suffix, optional: p.optional,
        }));
        if (positions.length === 0) setNoBasis(true);
        const rows = await base44.entities.Setting.filter({ key: 'email_offer_validity_days' }).catch(() => []);
        const days = parseInt(rows[0]?.value, 10) || 14;
        const valid = new Date();
        valid.setDate(valid.getDate() + days);
        const validLabel = valid.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        task = `AUFGABE: E-Mail zur Übermittlung unseres Angebots "${proposal.title}". Es liegt kein Angebotsdokument bei. Die E-Mail muss das Angebot daher selbst tragen. Baue nach dem Anschreiben eine kompakte Übersicht ein:
- je Position: Leistung, Ergebnis in einem Halbsatz, Preis netto
- Summe netto, 20% USt., brutto
- was NICHT enthalten ist (1-3 Zeilen)
- Gültigkeit: exakt dieser Satz: "Dieses Angebot gilt bis ${validLabel}."
- ein Satz mit Verweis auf die AGB
Erfinde keine Position und keinen Preis, die nicht im freigegebenen Mapping stehen.

FREIGEGEBENE POSITIONEN & PREISE (verbindliche und einzige Quelle):
${JSON.stringify({ positions, total_net: mapping?.total_net || '', total_gross: mapping?.total_gross || '' }, null, 2)}`;
      }

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Du schreibst als ${user?.full_name || 'Alfons Rittler'} von der Agentur Rittler & Co (Österreich, per Sie, professionell aber persönlich) an ${deal.contact_name || 'den Kunden'} von ${deal.company_name || deal.title}.

${task}

Kontext der Anfrage:
${deal.description || '—'}
${proposal.client_project_scope ? `\nLeistungsumfang: ${proposal.client_project_scope}` : ''}

Erstelle GENAU ZWEI unterschiedliche Varianten:
- Variante 1: kompakt und direkt
- Variante 2: ausführlicher und beratend
Beide auf Deutsch, mit Anrede und Grußformel (Unterschrift: ${user?.full_name || 'Alfons Rittler'}, Rittler & Co). Keine Platzhalter wie [Name].`,
        response_json_schema: {
          type: 'object',
          properties: {
            variants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  style: { type: 'string' },
                  subject: { type: 'string' },
                  body: { type: 'string' },
                },
              },
            },
          },
        },
      });
      const v = (res.variants || []).slice(0, 2);
      setVariants(v);
      setSelected(0);
      setSubject(v[0]?.subject || '');
      setBody(v[0]?.body || '');
    } catch (e) {
      setError('Generierung fehlgeschlagen: ' + (e?.message || ''));
    }
    setGenerating(false);
  };

  useEffect(() => {
    if (open) generate();
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickVariant = (idx) => {
    setSelected(idx);
    setSubject(variants[idx]?.subject || '');
    setBody(variants[idx]?.body || '');
  };

  const linkLine = hasPdf && includeLink && !isFollowup
    ? `\n\nDas vollständige Angebot finden Sie hier: ${proposal.pdf_url}`
    : '';

  const sendAndLog = async () => {
    setSaving(true); setError(null);
    try {
      const finalBody = body + linkLine;
      const now = new Date().toISOString();
      await base44.entities.CrmActivity.create({
        deal_id: deal.id,
        activity_type: 'email',
        title: `${isFollowup ? 'Nachfass-E-Mail' : 'Angebots-E-Mail'} an ${deal.contact_email || deal.contact_name || 'Kunde'} — ${subject}`,
        content: finalBody,
        activity_date: now,
      });
      const patch = { next_step: 'Nachfassen, wenn keine Antwort', next_step_date: addDays(7) };
      if (!isFollowup && deal.pipeline === 'new_business' && !['proposal_sent', 'negotiation'].includes(deal.stage)) {
        patch.stage = 'proposal_sent';
      }
      await base44.entities.CrmDeal.update(deal.id, patch);
      // E-Mail-Programm mit fertigem Entwurf öffnen (Versand über die eigene Mailadresse)
      window.open(`mailto:${deal.contact_email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`, '_self');
      setSaving(false);
      onSent?.();
    } catch (e) {
      setError('Speichern fehlgeschlagen: ' + (e?.message || ''));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isFollowup ? 'Nachfass-E-Mail' : 'Angebots-E-Mail'} — {deal.company_name || deal.title}</DialogTitle>
        </DialogHeader>

        {generating ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Zwei E-Mail-Varianten werden erstellt…
          </div>
        ) : (
          <>
            {variants.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {variants.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => pickVariant(i)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      selected === i ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'
                    }`}
                  >
                    <p className="text-xs font-semibold">Variante {i + 1}{v.style ? ` — ${v.style}` : ''}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3">{v.body}</p>
                  </button>
                ))}
              </div>
            )}

            {noBasis && !isFollowup && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                Achtung: Es liegt weder ein PDF noch ein freigegebenes Mapping mit Positionen vor —
                die Mail kann keine verbindlichen Leistungen und Preise enthalten. Angebot zuerst im
                Angebots-Studio fertigstellen.
              </p>
            )}

            <div>
              <Label className="text-xs">Betreff</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">E-Mail-Text (frei anpassbar)</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 min-h-[220px] text-sm" />
              {linkLine && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Wird am Ende angefügt: „Das vollständige Angebot finden Sie hier: …"
                </p>
              )}
            </div>

            {!isFollowup && hasPdf && (
              <div className="flex items-center justify-between gap-3 flex-wrap border rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <Switch id="offer-pdf-link" checked={includeLink} onCheckedChange={setIncludeLink} />
                  <Label htmlFor="offer-pdf-link" className="text-xs">
                    PDF-Link in den Mailtext einfügen
                  </Label>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <a href={proposal.pdf_url} download><Download className="w-3.5 h-3.5" /> PDF herunterladen</a>
                </Button>
              </div>
            )}

            {!isFollowup && (
              <p className="text-[11px] text-muted-foreground">
                {hasPdf
                  ? 'Das Angebot liegt als PDF vor. Der Link steht im Text; für einen Anhang die Datei hier herunterladen — mailto: kann keine Datei anhängen. Der Link-Schalter: die Datei-URL ist ohne Anmeldung erreichbar.'
                  : 'Es liegt kein Angebots-PDF vor — die Leistungen und Preise stehen deshalb direkt in der E-Mail. PDF wahlweise vorher im Angebots-Studio erzeugen.'}
                {' '}Nach dem Übernehmen wird die E-Mail in der Deal-Historie protokolliert und der nächste Schritt „Nachfassen" auf +7 Tage gesetzt.
              </p>
            )}
          </>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-between gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={generate} disabled={generating || saving}>
            <RefreshCw className="w-3.5 h-3.5" /> Neu generieren
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Abbrechen</Button>
            <Button onClick={sendAndLog} disabled={generating || saving || !subject || !body} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Im E-Mail-Programm öffnen & protokollieren
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}