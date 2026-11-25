import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

// Gründe für „Ohne Rechnung abschließen“ (25.11.2026) — gleiche Werte in supportVerrechnung,
// TimeEntry.nicht_verrechnet_grund, Ticket.verrechnung_grund und SupportTicketCustomer.verrechnung_grund
export const ABSCHLUSS_GRUENDE = [
  { value: 'wartungsvertrag', label: 'Im Wartungsvertrag enthalten' },
  { value: 'anderer_auftrag', label: 'In anderem Auftrag/Pauschale enthalten' },
  { value: 'bereits_verrechnet', label: 'Bereits verrechnet (aWork oder andere Rechnung)' },
  { value: 'kulanz', label: 'Kulanz' },
  { value: 'doppelt_fehlbuchung', label: 'Doppelt / Test- oder Fehlbuchung' },
  { value: 'sonstiges', label: 'Sonstiges' },
];
export const GRUND_LABEL = {
  ...Object.fromEntries(ABSCHLUSS_GRUENDE.map((g) => [g.value, g.label])),
  keine_gesonderte_abrechnung: 'Keine gesonderte Abrechnung nötig',
};

const eur = (n) => n.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
const std = (min) => ((Number(min) || 0) / 60).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const betragVon = (p) => ((Number(p.billable_minutes) || 0) / 60) * (Number(p.stundensatz) || 0);

// Vorschlag für den Grund — nur, wenn alle gewählten Positionen dasselbe nahelegen
function vorschlagFuer(liste) {
  if (!liste.length) return '';
  if (liste.every((p) => p.ohne_zeit_code === 'doppelt')) return 'doppelt_fehlbuchung';
  if (liste.every((p) => p.vorbehalt || p.ohne_zeit_code === 'zeit_in_awork' || p.art === 'awork')) return 'bereits_verrechnet';
  if (liste.every((p) => p.ohne_zeit_code === 'anderer_auftrag')) return 'anderer_auftrag';
  return '';
}

// Positionen der Support-Abrechnung ohne Rechnung abschließen.
// positionen: [{ key, task_title, projekt_name?, art: 'support'|'regie'|'awork', billable_minutes, stundensatz,
//               ticket_id?, time_entry_ids?, awork_task_id?, ohne_zeit?, ohne_zeit_code?, vorbehalt? }]
// vorausgewaehlt: Schlüssel, die beim Öffnen angehakt sind (Einzelposition: diese eine; Kundenblock: keine)
export default function SupportAbschliessenDialog({ kunde, positionen, vorausgewaehlt = [], open, onOpenChange, onDone }) {
  const [selected, setSelected] = useState(vorausgewaehlt);
  const [grund, setGrund] = useState(() => vorschlagFuer(positionen.filter((p) => vorausgewaehlt.includes(p.key))));
  const [notiz, setNotiz] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const grundManuell = useRef(false);

  const gewaehlt = positionen.filter((p) => selected.includes(p.key));
  // Solange kein Grund von Hand gewählt wurde, folgt der Vorschlag der Auswahl
  useEffect(() => {
    if (!grundManuell.current) setGrund(vorschlagFuer(gewaehlt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join('|')]);

  const summe = Math.round(gewaehlt.reduce((s, p) => s + betragVon(p), 0) * 100) / 100;
  const minuten = gewaehlt.reduce((s, p) => s + (Number(p.billable_minutes) || 0), 0);
  const ok = gewaehlt.length > 0 && grund && (grund !== 'sonstiges' || notiz.trim());
  const mehrere = positionen.length > 1;

  const speichern = async () => {
    setBusy(true);
    setFehler('');
    try {
      const res = await base44.functions.invoke('supportVerrechnung', {
        aktion: 'abschliessen',
        grund,
        notiz,
        positionen: gewaehlt.map((p) => (p.awork_task_id
          ? { awork_task_id: p.awork_task_id, kunde: kunde || '' }
          : { ticket_id: p.ticket_id || null, time_entry_ids: p.time_entry_ids || [] })),
      });
      if (res.data?.error) throw new Error(res.data.error);
      onDone();
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle>Ohne Rechnung abschließen{kunde ? ` — ${kunde}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {mehrere && <p className="text-xs text-muted-foreground">Welche Positionen sollen ohne Rechnung abgeschlossen werden?</p>}
          <div className="border rounded-lg divide-y">
            {positionen.map((p) => {
              const aktiv = selected.includes(p.key);
              const betrag = betragVon(p);
              return (
                <label key={p.key} className={`flex items-start gap-3 px-3 py-2 ${mehrere ? 'cursor-pointer' : ''} ${aktiv ? '' : 'opacity-60'}`}>
                  {mehrere && (
                    <Checkbox
                      className="mt-0.5"
                      checked={aktiv}
                      onCheckedChange={(c) => setSelected((s) => (c ? [...s, p.key] : s.filter((x) => x !== p.key)))}
                    />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{p.task_title}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {[p.projekt_name, p.art === 'regie' ? 'Regie' : p.art === 'awork' ? 'Altbestand aWork' : 'Support'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-xs text-right flex-shrink-0 w-28">
                    {p.billable_minutes > 0
                      ? <><span className="block">{std(p.billable_minutes)} h</span><span className="block text-muted-foreground">{eur(betrag)}</span></>
                      : <span className="text-muted-foreground">keine Zeit</span>}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-sm border rounded-lg px-3 py-2 bg-muted/40">
            <span>Verzicht netto{gewaehlt.length ? ` · ${gewaehlt.length} Position${gewaehlt.length === 1 ? '' : 'en'}, ${std(minuten)} h` : ''}</span>
            <span className="font-semibold">{eur(summe)}</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Grund</Label>
            {ABSCHLUSS_GRUENDE.map((g) => (
              <label key={g.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="abschluss-grund"
                  value={g.value}
                  checked={grund === g.value}
                  onChange={() => { grundManuell.current = true; setGrund(g.value); }}
                />
                {g.label}
              </label>
            ))}
          </div>
          <div>
            <Label className="text-xs">Notiz {grund === 'sonstiges' ? '(Pflicht)' : '(optional)'}</Label>
            <Textarea rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. im Wartungspaket Premium enthalten" />
          </div>
          <p className="text-xs text-muted-foreground">
            Die Positionen verschwinden aus der Abrechnung. Die gebuchten Stunden bleiben Arbeitszeit und zählen in den
            Auswertungen weiter. 30 Tage lang lassen sie sich unter „Ohne Rechnung abgeschlossen“ zurückholen.
          </p>
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={speichern} disabled={busy || !ok}>{busy ? 'Wird abgeschlossen …' : 'Ohne Rechnung abschließen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
