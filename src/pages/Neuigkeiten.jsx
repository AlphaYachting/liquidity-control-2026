import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/AuthContext';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { istInhaber } from '@/lib/rueckmeldung/rueckmeldung';
import { unwrapLLM } from '@/components/crm/proposals/jsonFields';
import NeuigkeitInhalt from '@/components/neuigkeiten/NeuigkeitInhalt';
import NeuigkeitenBuehne, { BuehneKnopf, BUEHNE_RAHMEN, BUEHNE_RAHMEN_STIL } from '@/components/neuigkeiten/NeuigkeitenBuehne';
import { FUSS_HINWEIS } from '@/components/neuigkeiten/NeuigkeitenFenster';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ZIELGRUPPEN, ZIELGRUPPE_LABEL, ALLE_KEY, VEROEFFENTLICHT_KEY, GELESEN_KEY, ladeAlle, tag, punkteAusText, punkteAlsText,
} from '@/lib/neuigkeiten';

// Verwaltung der Ausgaben „Was ist neu" — nur für den Inhaber.
// Entwurf → Vorschau → Veröffentlichen. Erst nach dem Veröffentlichen erscheint die Ausgabe
// beim nächsten Öffnen der App, je Person genau einmal.

const heute = () => new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
const LEER = { id: null, titel: '', zielgruppe: 'alle', text: '', rueckmeldung_ids: [] };

function Knopf({ children, onClick, disabled, dunkel, gefahr, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-8 px-3 text-[12.5px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
      style={{
        borderRadius: 3,
        border: `1px solid ${dunkel ? RITTLER.black : RITTLER.line}`,
        backgroundColor: dunkel ? RITTLER.black : RITTLER.white,
        color: gefahr ? STATUS_COLORS.critical : dunkel ? RITTLER.white : RITTLER.black,
      }}
    >
      {children}
    </button>
  );
}

// Wer hat eine veröffentlichte Ausgabe schon bestätigt?
function Lesestand({ ausgabe, team }) {
  const { data: gelesen = [], isLoading } = useQuery({
    queryKey: ['neuigkeit-lesestand', ausgabe.id],
    queryFn: () => base44.entities.NeuigkeitGelesen.filter({ neuigkeit_id: ausgabe.id }, 'gelesen_am', 200),
  });
  if (isLoading) return null;
  const emails = new Set(gelesen.map((g) => (g.person_email || '').toLowerCase()));
  const offen = team.filter((p) => !emails.has((p.email || '').toLowerCase()));
  return (
    <div className="text-[12.5px] space-y-1" style={{ color: RITTLER.textSecondary }}>
      <p><strong style={{ color: RITTLER.black }}>{gelesen.length}</strong> Bestätigung{gelesen.length === 1 ? '' : 'en'}</p>
      {offen.length > 0 && <p>Noch nicht gesehen: {offen.map((p) => p.name).join(', ')}</p>}
      <p className="text-[11.5px]">Personen außerhalb der Zielgruppe bekommen die Ausgabe nicht angezeigt.</p>
    </div>
  );
}

export default function Neuigkeiten() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState(LEER);
  const [busy, setBusy] = useState('');
  const [meldung, setMeldung] = useState('');
  const [fensterVorschau, setFensterVorschau] = useState(false);

  const { data: ausgaben = [], isLoading } = useQuery({ queryKey: ALLE_KEY, queryFn: ladeAlle });
  const { data: team = [] } = useQuery({
    queryKey: ['neuigkeiten-team'],
    queryFn: () => base44.entities.TeamMember.filter({ active: true }, 'name', 50),
    staleTime: 10 * 60 * 1000,
  });

  const gewaehlt = ausgaben.find((a) => a.id === form.id) || null;
  const veroeffentlicht = gewaehlt?.status === 'veroeffentlicht';
  const vorschau = useMemo(() => ({ titel: form.titel || `Neu seit ${heute()}`, punkte: punkteAusText(form.text) }), [form]);

  useEffect(() => { setMeldung(''); }, [form.id]);

  if (!istInhaber(user)) {
    return <p className="text-sm" style={{ color: RITTLER.textSecondary }}>Diese Seite ist nur für den Inhaber sichtbar.</p>;
  }

  const waehle = (a) => setForm({
    id: a.id, titel: a.titel || '', zielgruppe: a.zielgruppe || 'alle', text: punkteAlsText(a.punkte), rueckmeldung_ids: a.rueckmeldung_ids || [],
  });

  const neu = () => setForm({ ...LEER, titel: `Neu seit ${heute()}` });

  const auffrischen = () => Promise.all([
    qc.invalidateQueries({ queryKey: ALLE_KEY }),
    qc.invalidateQueries({ queryKey: VEROEFFENTLICHT_KEY }),
  ]);

  const daten = () => ({
    titel: (form.titel || `Neu seit ${heute()}`).trim(),
    zielgruppe: form.zielgruppe || 'alle',
    punkte: punkteAusText(form.text),
    rueckmeldung_ids: form.rueckmeldung_ids || [],
  });

  const speichern = async () => {
    setBusy('speichern');
    try {
      if (form.id) {
        await base44.entities.Neuigkeit.update(form.id, daten());
      } else {
        const neuer = await base44.entities.Neuigkeit.create({ ...daten(), status: 'entwurf' });
        setForm((f) => ({ ...f, id: neuer.id }));
      }
      await auffrischen();
      setMeldung('Entwurf gespeichert.');
    } catch (e) {
      setMeldung(`Speichern fehlgeschlagen: ${e?.message || e}`);
    }
    setBusy('');
  };

  const veroeffentlichen = async () => {
    const d = daten();
    if (!d.punkte.length) { setMeldung('Mindestens ein Punkt ist nötig.'); return; }
    const gruppe = ZIELGRUPPE_LABEL[d.zielgruppe] || 'Alle';
    if (!window.confirm(`„${d.titel}" jetzt veröffentlichen?\n\nZielgruppe: ${gruppe}\nDie Ausgabe erscheint beim nächsten Öffnen der App, je Person einmal.`)) return;
    setBusy('veroeffentlichen');
    try {
      const jetzt = new Date().toISOString();
      let id = form.id;
      if (id) await base44.entities.Neuigkeit.update(id, { ...d, status: 'veroeffentlicht', veroeffentlicht_am: jetzt });
      else id = (await base44.entities.Neuigkeit.create({ ...d, status: 'veroeffentlicht', veroeffentlicht_am: jetzt })).id;
      // Der Inhaber hat die Ausgabe gerade selbst geschrieben — für ihn gilt sie als gelesen
      await base44.entities.NeuigkeitGelesen.create({ neuigkeit_id: id, person_email: user.email, gelesen_am: jetzt });
      await qc.invalidateQueries({ queryKey: GELESEN_KEY(user.email) });
      await auffrischen();
      setForm((f) => ({ ...f, id }));
      setMeldung('Veröffentlicht. Die Kollegen sehen die Ausgabe beim nächsten Öffnen der App.');
    } catch (e) {
      setMeldung(`Veröffentlichen fehlgeschlagen: ${e?.message || e}`);
    }
    setBusy('');
  };

  const loeschen = async () => {
    if (!form.id || !window.confirm('Diesen Entwurf löschen?')) return;
    setBusy('loeschen');
    try {
      await base44.entities.Neuigkeit.delete(form.id);
      await auffrischen();
      setForm(LEER);
    } catch (e) {
      setMeldung(`Löschen fehlgeschlagen: ${e?.message || e}`);
    }
    setBusy('');
  };

  // Vorschlag aus den Rückmeldungen, die seit der letzten Ausgabe auf „umgesetzt" stehen.
  // Die KI formuliert nur um — der Text bleibt ein Entwurf, bis er veröffentlicht wird.
  const vorschlagen = async () => {
    setBusy('vorschlag');
    setMeldung('');
    try {
      const letzte = ausgaben.filter((a) => a.status === 'veroeffentlicht').map((a) => a.veroeffentlicht_am).sort().at(-1) || '';
      const verwendet = new Set(ausgaben.flatMap((a) => a.rueckmeldung_ids || []));
      const umgesetzt = await base44.entities.Rueckmeldung.filter({ status: 'umgesetzt' }, '-bearbeitet_am', 100);
      const kandidaten = umgesetzt.filter((r) => !verwendet.has(r.id) && (!letzte || (r.bearbeitet_am || r.updated_date || '') > letzte));
      if (!kandidaten.length) { setMeldung('Seit der letzten Ausgabe gibt es keine neu umgesetzten Rückmeldungen.'); setBusy(''); return; }
      const name = (r) => {
        const p = team.find((t) => (t.email || '').toLowerCase() === (r.person_email || '').toLowerCase());
        return (p?.name || r.person_name || '').split(' ')[0];
      };
      const eingabe = kandidaten.map((r, i) => `${i + 1}. [${r.art}] von ${name(r)}: ${r.text}${r.antwort ? `\n   Antwort/Umsetzung: ${r.antwort}` : ''}`).join('\n');
      const res = unwrapLLM(await base44.integrations.Core.InvokeLLM({
        prompt: `Du schreibst die Ausgabe „Was ist neu" für die interne Agentursoftware einer kleinen Werbeagentur.
Unten stehen umgesetzte Rückmeldungen der Kollegen. Formuliere daraus höchstens 6 Punkte für das Team:
- je Punkt ein Satz in Du-Form, Alltagssprache, was man jetzt tun kann oder was jetzt anders ist (z. B. „Du kannst eine Buchung jetzt mit einem Klick erneut starten.")
- keine Technikbegriffe, keine Ids, keine Fehlerbeschreibung, nichts erfinden
- zusammengehörige Rückmeldungen zu einem Punkt bündeln, reine Fragen ohne Änderung weglassen
- "von" = Vorname der Person(en), deren Rückmeldung den Punkt ausgelöst hat
- "quellen" = die Nummern der verwendeten Rückmeldungen

RÜCKMELDUNGEN:
${eingabe}`,
        response_json_schema: {
          type: 'object',
          properties: {
            punkte: {
              type: 'array',
              items: { type: 'object', properties: { text: { type: 'string' }, von: { type: 'string' }, quellen: { type: 'array', items: { type: 'number' } } }, required: ['text'] },
            },
          },
          required: ['punkte'],
        },
      }));
      const punkte = (res?.punkte || []).filter((p) => p?.text);
      const ids = [...new Set(punkte.flatMap((p) => (p.quellen || []).map((n) => kandidaten[n - 1]?.id).filter(Boolean)))];
      setForm((f) => ({
        ...f,
        titel: f.titel || `Neu seit ${heute()}`,
        text: [f.text, punkteAlsText(punkte)].filter(Boolean).join('\n'),
        rueckmeldung_ids: [...new Set([...(f.rueckmeldung_ids || []), ...ids])],
      }));
      setMeldung(`${punkte.length} Punkte aus ${kandidaten.length} Rückmeldungen vorgeschlagen — bitte prüfen und anpassen.`);
    } catch (e) {
      setMeldung(`Vorschlag fehlgeschlagen: ${e?.message || e}`);
    }
    setBusy('');
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold" style={{ color: RITTLER.black }}>Was ist neu</h1>
        <p className="text-[13px] mt-1" style={{ color: RITTLER.textSecondary }}>
          Ausgaben erscheinen nach dem Veröffentlichen beim nächsten Öffnen der App, je Person einmal. Danach stehen sie hinter dem Symbol neben der Suche.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <div className="bg-background border p-3 space-y-2 self-start" style={{ borderColor: RITTLER.line, borderRadius: 4 }}>
          <Knopf onClick={neu}><Plus className="w-4 h-4" /> Neue Ausgabe</Knopf>
          {isLoading ? (
            <p className="text-[12.5px]" style={{ color: RITTLER.textSecondary }}>Wird geladen …</p>
          ) : ausgaben.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: RITTLER.textSecondary }}>Noch keine Ausgaben.</p>
          ) : ausgaben.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => waehle(a)}
              className="w-full text-left px-2.5 py-2 hover:bg-muted"
              style={{ borderRadius: 3, border: `1px solid ${a.id === form.id ? RITTLER.black : 'transparent'}` }}
            >
              <span className="block text-[13px] font-semibold" style={{ color: RITTLER.black }}>{a.titel}</span>
              <span className="block text-[11.5px]" style={{ color: a.status === 'veroeffentlicht' ? STATUS_COLORS.doneText : RITTLER.textSecondary }}>
                {a.status === 'veroeffentlicht' ? `veröffentlicht ${tag(a.veroeffentlicht_am)}` : 'Entwurf'} · {ZIELGRUPPE_LABEL[a.zielgruppe || 'alle']}
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-background border p-4 space-y-3" style={{ borderColor: RITTLER.line, borderRadius: 4 }}>
            <label className="block text-[12px] font-semibold" style={{ color: RITTLER.textSecondary }}>
              Titel
              <input
                value={form.titel}
                onChange={(e) => setForm({ ...form, titel: e.target.value })}
                placeholder={`Neu seit ${heute()}`}
                disabled={veroeffentlicht}
                className="mt-1 w-full h-9 px-2.5 text-[13.5px] border bg-background"
                style={{ borderRadius: 3, borderColor: RITTLER.line, color: RITTLER.black }}
              />
            </label>
            <label className="block text-[12px] font-semibold" style={{ color: RITTLER.textSecondary }}>
              Wer sieht die Ausgabe?
              <select
                value={form.zielgruppe}
                onChange={(e) => setForm({ ...form, zielgruppe: e.target.value })}
                disabled={veroeffentlicht}
                className="mt-1 w-full h-9 px-2 text-[13.5px] border bg-background"
                style={{ borderRadius: 3, borderColor: RITTLER.line, color: RITTLER.black }}
              >
                {ZIELGRUPPEN.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </label>
            <label className="block text-[12px] font-semibold" style={{ color: RITTLER.textSecondary }}>
              Punkte — eine Zeile je Punkt, optional „— Wunsch von Name"
              <Textarea
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                disabled={veroeffentlicht}
                rows={10}
                placeholder={'Du kannst eine Buchung jetzt mit einem Klick erneut starten. — Wunsch von Johannes'}
                className="mt-1 text-[13.5px]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {!veroeffentlicht && (
                <>
                  <Knopf onClick={vorschlagen} disabled={!!busy} title="Formuliert die seit der letzten Ausgabe umgesetzten Rückmeldungen als Punkte">
                    {busy === 'vorschlag' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Vorschlag aus Rückmeldungen
                  </Knopf>
                  <Knopf onClick={speichern} disabled={!!busy}>{busy === 'speichern' && <Loader2 className="w-4 h-4 animate-spin" />}Entwurf speichern</Knopf>
                  <Knopf onClick={veroeffentlichen} disabled={!!busy} dunkel>{busy === 'veroeffentlichen' && <Loader2 className="w-4 h-4 animate-spin" />}Veröffentlichen</Knopf>
                  {form.id && <Knopf onClick={loeschen} disabled={!!busy} gefahr><Trash2 className="w-4 h-4" /> Löschen</Knopf>}
                </>
              )}
            </div>
            {meldung && <p className="text-[12.5px]" style={{ color: RITTLER.black }}>{meldung}</p>}
            {veroeffentlicht && <Lesestand ausgabe={gewaehlt} team={team} />}
          </div>

          <div className="bg-background border p-5 self-start" style={{ borderColor: RITTLER.line, borderRadius: 4 }}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: RITTLER.textSecondary }}>Vorschau — so sehen es die Kollegen</p>
              <Knopf onClick={() => setFensterVorschau(true)} title="Zeigt das Begrüßungsfenster genau so, wie es nach dem Update erscheint — ohne etwas als gelesen zu markieren">
                <Sparkles className="w-4 h-4" /> Als Fenster ansehen
              </Knopf>
            </div>
            <NeuigkeitInhalt ausgabe={veroeffentlicht ? gewaehlt : vorschau} />
            <Dialog open={fensterVorschau} onOpenChange={setFensterVorschau}>
              <DialogContent className={`${BUEHNE_RAHMEN} [&>button]:text-white [&>button]:opacity-80 [&>button]:z-10`} style={BUEHNE_RAHMEN_STIL}>
                <NeuigkeitenBuehne
                  ausgaben={[veroeffentlicht ? gewaehlt : vorschau]}
                  Titel={DialogTitle}
                  Beschreibung={DialogDescription}
                  fuss={(
                    <>
                      {FUSS_HINWEIS}
                      <BuehneKnopf onClick={() => setFensterVorschau(false)}>Vorschau schließen</BuehneKnopf>
                    </>
                  )}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
