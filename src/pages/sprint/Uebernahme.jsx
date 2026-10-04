import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';
import { Skeleton } from '@/components/ui/skeleton';
import Seitenkopf from '@/components/shared/Seitenkopf';
import UebernahmeTicket from '@/components/sprint/uebernahme/UebernahmeTicket';
import UebernahmeTeam from '@/components/sprint/uebernahme/UebernahmeTeam';
import {
  ANTWORTEN, UEBERNAHME_KEY, UEBERNAHME_TEAM_KEY, antworte, antworteAlle, brauchtAntwort, herkunft, istBestaetigt,
  ladeMeineUebernahme, ladeUebernahmeTeam, meldeHinweis, speichereDetail, verteileNeu, vorschlag, warSchonMeins,
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

// Mehrere Tickets auf einmal: eine Antwort für alle oder alle an eine Person weitergeben.
function Sammel({ tickets, members, onAusfuehren, mitVorschlag = false }) {
  const [wahl, setWahl] = useState('');
  const [stand, setStand] = useState('');
  const offen = tickets.filter(brauchtAntwort);
  if (offen.length < 2) return null;
  const los = async () => {
    if (!wahl) return;
    await onAusfuehren(offen, wahl, setStand);
    setWahl('');
  };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Alle ${offen.length} offenen auf einmal`}
        value={wahl} onChange={(e) => setWahl(e.target.value)}
        className="h-9 rounded border border-[#d4d4d4] bg-white px-2 text-[13px] text-foreground"
      >
        <option value="">Alle {offen.length} offenen …</option>
        {mitVorschlag && <option value="vorschlag">Stand aus aWork stimmt — alle so bestätigen</option>}
        <optgroup label="Weitergeben an">
          {members.map((m) => <option key={m.email} value={`an:${m.email}`}>{m.name}</option>)}
        </optgroup>
        <optgroup label="Antwort für alle">
          {ANTWORTEN.map((a) => <option key={a.wert} value={a.wert}>{a.label}</option>)}
        </optgroup>
      </select>
      <button
        type="button" onClick={los} disabled={!wahl || stand.endsWith('…')}
        className="min-h-[36px] rounded border border-foreground bg-white px-3 text-[13px] font-semibold hover:bg-muted disabled:opacity-50"
      >
        Übernehmen
      </button>
      {stand && <span className="text-xs text-muted-foreground">{stand}</span>}
    </span>
  );
}

// ÜBERNAHME — einmalig nach dem Umstieg: jede Person bestätigt ihre Alttickets,
// gibt weiter oder zurück, was nicht zu ihr gehört, und meldet, was fehlt.
export default function Uebernahme() {
  const { user } = useAuth();
  const zugriff = useZugriff();
  const queryClient = useQueryClient();
  const email = user?.email;
  const [ansicht, setAnsicht] = useState('meine');
  const [gewaehlt, setGewaehlt] = useState(null);
  const [laeuft, setLaeuft] = useState({});
  const [fehler, setFehler] = useState({});

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

  const meinName = data?.members?.find((m) => gleich(m.email, email))?.name || user?.full_name || '';

  const gruppen = useMemo(() => {
    if (!data) return [];
    const projektById = Object.fromEntries(data.projekte.map((p) => [p.id, p]));
    const clientById = Object.fromEntries((data.clients || []).map((c) => [c.id, c]));
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

  const andere = (data.members || []).filter((m) => !gleich(m.email, email));
  const gesamt = data.tickets.length;
  const bestaetigt = data.tickets.filter((t) => istBestaetigt(t) || t.status === 'erledigt').length;
  const offenGesamt = data.tickets.filter(brauchtAntwort).length;
  const geerbtGesamt = data.tickets.filter((t) => brauchtAntwort(t) && !warSchonMeins(t, meinName)).length;
  const aktiv = gruppen.find((g) => g.id === gewaehlt) || gruppen.find((g) => g.offen > 0) || gruppen[0] || null;
  const naechste = aktiv ? gruppen.find((g) => g.id !== aktiv.id && g.offen > 0) : null;
  const istFuehrung = zugriff.darf('fuehrung');
  const darfArchivieren = (p) => istFuehrung || gleich(p?.pm_email, email);

  // Das aktive Projekt gliedern: was schon in aWork bei mir lag, danach Geerbtes je aWork-Liste.
  const abschnitte = [];
  if (aktiv) {
    const eigene = aktiv.tickets.filter((t) => warSchonMeins(t, meinName));
    if (eigene.length) abschnitte.push({ key: '__eigene', titel: 'Deine Tickets', geerbt: false, tickets: eigene });
    const nachListe = {};
    aktiv.tickets.filter((t) => !warSchonMeins(t, meinName)).forEach((t) => {
      const liste = herkunft(t).liste || 'Ohne Liste';
      (nachListe[liste] = nachListe[liste] || []).push(t);
    });
    Object.entries(nachListe).forEach(([liste, tickets]) => {
      const namen = [...new Set(tickets.flatMap((t) => herkunft(t).zugewiesen))];
      abschnitte.push({
        key: liste, titel: liste, geerbt: true, tickets,
        vorher: namen.length ? `in aWork bei ${namen.join(', ')}` : 'in aWork niemandem zugeteilt',
      });
    });
  }

  const setze = (fn) => queryClient.setQueryData(UEBERNAHME_KEY(email), (alt) => (alt ? { ...alt, tickets: fn(alt.tickets) } : alt));
  const ersetze = (neu) => setze((liste) => liste.map((t) => (t.id === neu.id ? neu : t)));
  const entferne = (id) => setze((liste) => liste.filter((t) => t.id !== id));
  const nachAenderung = () => {
    queryClient.invalidateQueries({ queryKey: ['sprintHeute'] });
    queryClient.invalidateQueries({ queryKey: UEBERNAHME_TEAM_KEY });
  };
  const merkeFehler = (id, e) => setFehler((f) => ({ ...f, [id]: `Nicht gespeichert: ${e?.message || 'unbekannter Fehler'}` }));

  const beiAntwort = async (ticket, wert) => {
    setLaeuft((l) => ({ ...l, [ticket.id]: true }));
    setFehler((f) => ({ ...f, [ticket.id]: '' }));
    try {
      const projekt = data.projekte.find((p) => p.id === ticket.project_id);
      ersetze(await antworte(ticket, wert, { email, darfArchivieren: darfArchivieren(projekt) }));
      nachAenderung();
    } catch (e) { merkeFehler(ticket.id, e); }
    setLaeuft((l) => ({ ...l, [ticket.id]: false }));
  };

  const beiDetail = async (ticket, patch) => {
    try { ersetze(await speichereDetail(ticket, patch)); nachAenderung(); } catch (e) { merkeFehler(ticket.id, e); }
  };

  // Weitergeben: das Ticket liegt danach unbestätigt bei der gewählten Person und verschwindet hier.
  const beiWeitergeben = async (ticket, an) => {
    setLaeuft((l) => ({ ...l, [ticket.id]: true }));
    try { await verteileNeu(ticket, an); entferne(ticket.id); nachAenderung(); } catch (e) { merkeFehler(ticket.id, e); }
    setLaeuft((l) => ({ ...l, [ticket.id]: false }));
  };

  const sammelAusfuehren = async (ziel, wahl, setStand) => {
    setStand(`0 von ${ziel.length} …`);
    let fehlgeschlagen = 0;
    if (wahl.startsWith('an:')) {
      const an = wahl.slice(3);
      let n = 0;
      for (const t of ziel) {
        try { await verteileNeu(t, an); entferne(t.id); } catch (_) { fehlgeschlagen += 1; }
        n += 1;
        setStand(`${n} von ${ziel.length} …`);
      }
    } else if (wahl === 'vorschlag') {
      // Jedes Ticket mit dem Stand bestätigen, mit dem es aus aWork gekommen ist.
      const kontext = { email, darfArchivieren: false };
      let n = 0;
      for (const wert of ['offen', 'in_arbeit', 'wartet']) {
        const teil = ziel.filter((t) => vorschlag(t) === wert);
        if (!teil.length) continue;
        const basis = n;
        const res = await antworteAlle(teil, wert, kontext, (k) => setStand(`${basis + k} von ${ziel.length} …`));
        res.ergebnis.forEach(ersetze);
        fehlgeschlagen += res.fehler.length;
        n += teil.length;
      }
    } else {
      const res = await antworteAlle(
        ziel, wahl, { email, darfArchivieren: darfArchivieren(aktiv?.projekt) },
        (n, von) => setStand(`${n} von ${von} …`),
      );
      res.ergebnis.forEach(ersetze);
      fehlgeschlagen = res.fehler.length;
    }
    nachAenderung();
    setStand(fehlgeschlagen ? `${fehlgeschlagen} konnten nicht gespeichert werden.` : '');
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

      {ansicht === 'meine' && geerbtGesamt > 0 && (
        <div className="rounded-lg border border-border bg-white px-5 py-4 text-sm text-foreground">
          <span className="font-semibold">{geerbtGesamt} dieser Tickets lagen in aWork nicht bei dir.</span>{' '}
          Sie stammen von Kolleg:innen, die nicht mehr da sind, und wurden dir vorläufig zugeteilt.
          Was zu dir passt, bestätigst du. Den Rest gibst du weiter oder zurück in den Topf.
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
                  key={g.id} type="button" onClick={() => setGewaehlt(g.id)}
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {[aktiv.kunde, aktiv.projekt.title].filter(Boolean).join(' · ')}
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    {aktiv.tickets.length - aktiv.offen} von {aktiv.tickets.length} bestätigt
                  </p>
                </div>
                <Sammel
                  key={`alle-${aktiv.id}`} tickets={aktiv.tickets} members={andere} onAusfuehren={sammelAusfuehren}
                  mitVorschlag={abschnitte.length === 1 && !abschnitte[0].geerbt}
                />
              </div>

              {abschnitte.map((a) => (
                <section key={`${aktiv.id}-${a.key}`} className="overflow-hidden rounded-lg border border-border bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2.5">
                    <div className="min-w-0">
                      <h3 className="text-[11px] font-bold uppercase tracking-[1.6px] text-foreground">
                        {a.titel} · {a.tickets.length}
                      </h3>
                      {a.geerbt && <p className="text-xs text-muted-foreground">{a.vorher}</p>}
                    </div>
                    {abschnitte.length > 1 && (
                      <Sammel tickets={a.tickets} members={andere} onAusfuehren={sammelAusfuehren} mitVorschlag={!a.geerbt} />
                    )}
                  </div>
                  {a.tickets.map((t) => (
                    <UebernahmeTicket
                      key={t.id}
                      ticket={t}
                      geerbt={a.geerbt}
                      laeuft={!!laeuft[t.id]}
                      fehler={fehler[t.id]}
                      darfArchivieren={darfArchivieren(aktiv.projekt)}
                      members={andere}
                      onAntwort={beiAntwort}
                      onDetail={beiDetail}
                      onWeitergeben={beiWeitergeben}
                    />
                  ))}
                </section>
              ))}

              {aktiv.tickets.length === 0 && (
                <p className="rounded-lg border border-border bg-white px-5 py-4 text-sm text-muted-foreground">
                  In diesem Projekt liegt nichts mehr bei dir.
                </p>
              )}

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
                    onClick={() => { setGewaehlt(naechste.id); window.scrollTo({ top: 0 }); }}
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