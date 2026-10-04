import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';
import { Skeleton } from '@/components/ui/skeleton';
import Seitenkopf from '@/components/shared/Seitenkopf';
import UebernahmeTicket from '@/components/sprint/uebernahme/UebernahmeTicket';
import UebernahmeTeam from '@/components/sprint/uebernahme/UebernahmeTeam';
import {
  ANTWORTEN, UEBERNAHME_KEY, UEBERNAHME_TEAM_KEY, antworte, antworteAlle, brauchtAntwort, istBestaetigt,
  ladeMeineUebernahme, ladeUebernahmeTeam, meldeHinweis, speichereDetail,
} from '@/lib/sprint/uebernahme';

const gleich = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

// Freitext-Hinweis mit eigenem Senden-Knopf — bestätigt kurz, dass er angekommen ist.
function HinweisFeld({ label, placeholder, onSenden }) {
  const [text, setText] = useState('');
  const [stand, setStand] = useState('');
  const senden = async () => {
    if (!text.trim()) return;
    setStand('sendet');
    try { await onSenden(text); setText(''); setStand('gesendet'); } catch (_) { setStand('fehler'); }
  };
  return (
    <label className="flex flex-1 basis-64 flex-col gap-1.5 text-[13px] font-semibold text-foreground">
      {label}
      <textarea
        rows={2} value={text} placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); setStand(''); }}
        className="rounded border border-border bg-white px-3 py-2 text-sm font-normal text-foreground"
      />
      <span className="flex items-center gap-3">
        <button
          type="button" onClick={senden} disabled={!text.trim() || stand === 'sendet'}
          className="min-h-[40px] rounded border border-[#d4d4d4] bg-white px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50"
        >
          Melden
        </button>
        {stand === 'gesendet' && <span className="text-xs font-normal text-muted-foreground">Danke, ist gemeldet.</span>}
        {stand === 'fehler' && <span className="text-xs font-normal text-status-critical">Konnte nicht gespeichert werden.</span>}
      </span>
    </label>
  );
}

// ÜBERNAHME — einmalig nach dem Umstieg: jede Person bestätigt ihre Alttickets,
// gibt zurück, was nicht zu ihr gehört, und meldet, was fehlt.
export default function Uebernahme() {
  const { user } = useAuth();
  const zugriff = useZugriff();
  const queryClient = useQueryClient();
  const email = user?.email;
  const [ansicht, setAnsicht] = useState('meine');
  const [gewaehlt, setGewaehlt] = useState(null);
  const [laeuft, setLaeuft] = useState({});
  const [fehler, setFehler] = useState({});
  const [sammel, setSammel] = useState('');
  const [sammelStand, setSammelStand] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: UEBERNAHME_KEY(email),
    enabled: !!email,
    queryFn: () => ladeMeineUebernahme(email),
  });
  const { data: team, isLoading: ladeTeam } = useQuery({
    queryKey: UEBERNAHME_TEAM_KEY,
    enabled: !!email && ansicht === 'team',
    queryFn: ladeUebernahmeTeam,
  });

  const gruppen = useMemo(() => {
    if (!data) return [];
    const projektById = Object.fromEntries(data.projekte.map((p) => [p.id, p]));
    const clientById = Object.fromEntries(data.clients.map((c) => [c.id, c]));
    const nach = {};
    data.tickets.forEach((t) => { (nach[t.project_id] = nach[t.project_id] || []).push(t); });
    // Kundenprojekte zuerst, Internes und Wartungsverträge zuletzt; innerhalb nach Menge.
    const rang = (p) => (p.abrechnungsmodell === 'intern' ? 2 : p.retainer_art === 'wartung' ? 1 : 0);
    return Object.entries(nach)
      .map(([id, tickets]) => {
        const p = projektById[id];
        return {
          id, projekt: p, kunde: clientById[p.client_id]?.name || '',
          tickets: tickets.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.title || '').localeCompare(b.title || '')),
          offen: tickets.filter(brauchtAntwort).length,
        };
      })
      .sort((a, b) => rang(a.projekt) - rang(b.projekt) || b.tickets.length - a.tickets.length);
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="max-w-[1180px] mx-auto space-y-4">
        <Skeleton className="h-10 w-64 bg-muted" />
        <Skeleton className="h-64 w-full bg-muted" />
      </div>
    );
  }

  const gesamt = data.tickets.length;
  const bestaetigt = data.tickets.filter((t) => istBestaetigt(t) || t.status === 'erledigt').length;
  const offenGesamt = data.tickets.filter(brauchtAntwort).length;
  const aktiv = gruppen.find((g) => g.id === gewaehlt) || gruppen.find((g) => g.offen > 0) || gruppen[0] || null;
  const naechste = aktiv ? gruppen.find((g) => g.id !== aktiv.id && g.offen > 0) : null;
  const istFuehrung = zugriff.darf('fuehrung');
  const darfArchivieren = (p) => istFuehrung || gleich(p?.pm_email, email);

  const ersetze = (neu) => queryClient.setQueryData(UEBERNAHME_KEY(email), (alt) => (
    alt ? { ...alt, tickets: alt.tickets.map((t) => (t.id === neu.id ? neu : t)) } : alt
  ));
  const nachAenderung = () => {
    queryClient.invalidateQueries({ queryKey: ['sprintHeute'] });
    queryClient.invalidateQueries({ queryKey: UEBERNAHME_TEAM_KEY });
  };

  const beiAntwort = async (ticket, wert) => {
    setLaeuft((l) => ({ ...l, [ticket.id]: true }));
    setFehler((f) => ({ ...f, [ticket.id]: '' }));
    try {
      const projekt = data.projekte.find((p) => p.id === ticket.project_id);
      ersetze(await antworte(ticket, wert, { email, darfArchivieren: darfArchivieren(projekt) }));
      nachAenderung();
    } catch (e) {
      setFehler((f) => ({ ...f, [ticket.id]: `Nicht gespeichert: ${e?.message || 'unbekannter Fehler'}` }));
    }
    setLaeuft((l) => ({ ...l, [ticket.id]: false }));
  };

  const beiDetail = async (ticket, patch) => {
    try {
      ersetze(await speichereDetail(ticket, patch));
      nachAenderung();
    } catch (e) {
      setFehler((f) => ({ ...f, [ticket.id]: `Nicht gespeichert: ${e?.message || 'unbekannter Fehler'}` }));
    }
  };

  const sammelAntwort = async () => {
    if (!aktiv || !sammel) return;
    const ziel = aktiv.tickets.filter(brauchtAntwort);
    setSammelStand(`0 von ${ziel.length} …`);
    const { ergebnis, fehler: fehlgeschlagen } = await antworteAlle(
      ziel, sammel, { email, darfArchivieren: darfArchivieren(aktiv.projekt) },
      (n, von) => setSammelStand(`${n} von ${von} …`),
    );
    ergebnis.forEach(ersetze);
    nachAenderung();
    setSammel('');
    setSammelStand(fehlgeschlagen.length ? `${fehlgeschlagen.length} konnten nicht gespeichert werden.` : '');
  };

  const reiter = (key, label) => (
    <button
      type="button" onClick={() => setAnsicht(key)} aria-pressed={ansicht === key}
      className={`min-h-[44px] rounded border px-4 text-sm font-semibold ${ansicht === key
        ? 'border-foreground bg-foreground text-background' : 'border-[#d4d4d4] bg-white text-foreground hover:bg-muted'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-[1180px] mx-auto space-y-5">
      <Seitenkopf
        bereich="Übernahme"
        titel="Deine Tickets aus aWork"
        kontext="Einmal durchgehen, dann gehört dir nur noch, was wirklich deins ist."
        zurueck={{ to: '/sprint', label: 'Mein Tag' }}
        aktionen={(
          <div className="text-right">
            <p className="text-[22px] font-bold leading-tight text-foreground">{bestaetigt} von {gesamt}</p>
            <p className="text-xs text-muted-foreground">bestätigt</p>
          </div>
        )}
      />

      <div className="flex flex-wrap gap-2">
        {reiter('meine', `Meine Übernahme${offenGesamt ? ` · ${offenGesamt} offen` : ''}`)}
        {reiter('team', 'Topf & Fortschritt')}
      </div>

      {ansicht === 'team' && (
        ladeTeam || !team
          ? <Skeleton className="h-64 w-full bg-muted" />
          : (
            <UebernahmeTeam
              team={team}
              email={email}
              istFuehrung={istFuehrung}
              zeigeFortschritt={zugriff.darf('leitung')}
              onGeaendert={() => {
                queryClient.invalidateQueries({ queryKey: UEBERNAHME_TEAM_KEY });
                queryClient.invalidateQueries({ queryKey: UEBERNAHME_KEY(email) });
                queryClient.invalidateQueries({ queryKey: ['sprintHeute'] });
              }}
            />
          )
      )}

      {ansicht === 'meine' && gesamt === 0 && (
        <div className="rounded-lg border border-border bg-white px-5 py-4 text-sm text-muted-foreground">
          Dir sind keine Alttickets zugeteilt. Hier gibt es für dich nichts zu tun.
        </div>
      )}

      {ansicht === 'meine' && gesamt > 0 && (
        <div className="flex flex-wrap items-start gap-8">
          <nav aria-label="Deine Projekte" className="flex min-w-0 flex-1 basis-60 flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[1.8px] text-muted-foreground">Deine Projekte</p>
            {gruppen.map((g) => {
              const an = aktiv?.id === g.id;
              return (
                <button
                  key={g.id} type="button" onClick={() => { setGewaehlt(g.id); setSammel(''); setSammelStand(''); }}
                  aria-current={an ? 'true' : undefined}
                  className={`rounded border px-3.5 py-2.5 text-left ${an ? 'border-foreground' : 'border-border hover:bg-muted'} bg-white`}
                >
                  <span className="block text-sm font-semibold text-foreground">
                    {[g.kunde, g.projekt.title].filter(Boolean).join(' · ')}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {g.offen === 0 ? 'bestätigt' : `${g.offen} von ${g.tickets.length} offen`}
                    {g.projekt.status === 'pausiert' ? ' · pausiert' : ''}
                  </span>
                </button>
              );
            })}
            <div className="mt-3">
              <HinweisFeld
                label="Fehlt ein Projekt, an dem du arbeitest?"
                placeholder="Kunde und Projekt"
                onSenden={(text) => meldeHinweis(email, 'fehlendes_projekt', text)}
              />
            </div>
          </nav>

          {aktiv && (
            <main className="flex min-w-0 flex-[999] basis-[560px] flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-bold text-foreground">
                  {[aktiv.kunde, aktiv.projekt.title].filter(Boolean).join(' · ')}
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  {aktiv.tickets.length - aktiv.offen} von {aktiv.tickets.length} bestätigt
                </p>
              </div>

              {aktiv.offen > 1 && (
                <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-white px-4 py-3">
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    Alle {aktiv.offen} offenen auf einmal:
                    <select
                      value={sammel} onChange={(e) => setSammel(e.target.value)}
                      className="h-10 rounded border border-[#d4d4d4] bg-white px-2 text-sm font-normal"
                    >
                      <option value="">Antwort wählen</option>
                      {ANTWORTEN.map((a) => <option key={a.wert} value={a.wert}>{a.label}</option>)}
                    </select>
                  </label>
                  <button
                    type="button" onClick={sammelAntwort} disabled={!sammel || sammelStand.endsWith('…')}
                    className="min-h-[40px] rounded border border-foreground bg-white px-3 text-[13px] font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    Übernehmen
                  </button>
                  {sammelStand && <span className="text-xs text-muted-foreground">{sammelStand}</span>}
                </div>
              )}

              {aktiv.tickets.map((t) => (
                <UebernahmeTicket
                  key={t.id}
                  ticket={t}
                  laeuft={!!laeuft[t.id]}
                  fehler={fehler[t.id]}
                  darfArchivieren={darfArchivieren(aktiv.projekt)}
                  onAntwort={beiAntwort}
                  onDetail={beiDetail}
                />
              ))}

              <div className="flex flex-wrap gap-4 border-t border-border pt-5">
                <HinweisFeld
                  key={`a-${aktiv.id}`}
                  label="Fehlt hier eine Aufgabe?"
                  placeholder="Was fehlt?"
                  onSenden={(text) => meldeHinweis(email, 'fehlende_aufgabe', text, aktiv.id)}
                />
                <HinweisFeld
                  key={`p-${aktiv.id}`}
                  label="Stimmt an diesem Projekt etwas nicht?"
                  placeholder="Zum Beispiel: falscher Kunde, längst abgeschlossen"
                  onSenden={(text) => meldeHinweis(email, 'projekt_stimmt_nicht', text, aktiv.id)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-muted-foreground">
                  {aktiv.offen > 0
                    ? `Noch ${aktiv.offen} ohne Antwort. Du kannst später weitermachen, jede Antwort ist sofort gespeichert.`
                    : offenGesamt === 0 ? 'Alles bestätigt. Danke!' : 'Dieses Projekt ist bestätigt.'}
                </p>
                {naechste && (
                  <button
                    type="button"
                    onClick={() => { setGewaehlt(naechste.id); setSammel(''); setSammelStand(''); window.scrollTo({ top: 0 }); }}
                    className="min-h-[48px] rounded bg-primary px-5 text-sm font-bold uppercase tracking-wide text-white hover:bg-primary/90"
                  >
                    Weiter zum nächsten Projekt
                  </button>
                )}
              </div>
            </main>
          )}
        </div>
      )}
    </div>
  );
}
