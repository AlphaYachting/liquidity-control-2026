import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ticketBereinigen } from '@/lib/sprint/ticketBereinigen';
import {
  fortschrittJePerson, imTopf, istArchivVorschlag, verteileNeu, vorschlagAblehnen, WARTET_AUF,
} from '@/lib/sprint/uebernahme';

const gleich = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();
const tageSeit = (d) => (d ? Math.floor((Date.now() - new Date(`${d}T00:00:00`).getTime()) / 86400000) : null);
const AUF_LABEL = Object.fromEntries(WARTET_AUF.map((w) => [w.wert, w.label]));
const HINWEIS_LABEL = {
  fehlende_aufgabe: 'Fehlende Aufgabe',
  projekt_stimmt_nicht: 'Projekt stimmt nicht',
  fehlendes_projekt: 'Fehlendes Projekt',
};

function Block({ titel, anzahl, hinweis, children }) {
  return (
    <section className="rounded-lg border border-border bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[1.8px] text-muted-foreground">
          {titel}{typeof anzahl === 'number' ? ` · ${anzahl}` : ''}
        </h2>
        {hinweis && <p className="text-xs text-muted-foreground">{hinweis}</p>}
      </div>
      <div className="px-5 py-3">{children}</div>
    </section>
  );
}

const Leer = ({ children }) => <p className="py-1 text-sm text-muted-foreground">{children}</p>;

// Gesamtbild der Übernahme: Fortschritt je Person, Topf neu verteilen, Archiv-Vorschläge,
// Wartendes zum Nachfassen und gemeldete Hinweise.
export default function UebernahmeTeam({ team, email, istFuehrung, zeigeFortschritt, onGeaendert }) {
  const [laeuft, setLaeuft] = useState({});
  const [fehler, setFehler] = useState('');
  const { tickets, projektById, clients, members, hinweise } = team;
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const nameVon = (mail) => members.find((m) => gleich(m.email, mail))?.name || mail || '—';
  const projektName = (t) => {
    const p = projektById[t.project_id];
    const kunde = clientById[p?.client_id]?.name;
    return [kunde, p?.title].filter(Boolean).join(' · ') || 'Projekt';
  };
  const meinProjekt = (t) => istFuehrung || gleich(projektById[t.project_id]?.pm_email, email);

  const topf = tickets.filter((t) => imTopf(t) && meinProjekt(t));
  const vorschlaege = tickets.filter((t) => istArchivVorschlag(t) && meinProjekt(t));
  const wartend = tickets
    .filter((t) => t.status === 'wartet' && t.uebernahme_antwort === 'wartet' && (zeigeFortschritt || meinProjekt(t)))
    .sort((a, b) => (a.wartet_seit || '9999').localeCompare(b.wartet_seit || '9999'));
  const personen = zeigeFortschritt ? fortschrittJePerson(tickets, members) : [];

  const tun = async (id, fn) => {
    setLaeuft((l) => ({ ...l, [id]: true }));
    setFehler('');
    try { await fn(); onGeaendert(); } catch (e) { setFehler(e?.message || 'Aktion fehlgeschlagen'); }
    setLaeuft((l) => ({ ...l, [id]: false }));
  };

  const knopf = 'min-h-[40px] px-3 rounded border border-[#d4d4d4] bg-white text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-60';

  return (
    <div className="space-y-5">
      {fehler && <p className="rounded border border-border bg-white px-4 py-3 text-sm text-status-critical">{fehler}</p>}

      {zeigeFortschritt && (
        <Block titel="Fortschritt je Person" hinweis="Offen = noch ohne Antwort">
          {personen.length === 0 ? <Leer>Keine Alttickets in der Übernahme.</Leer> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-[1.6px] text-muted-foreground">
                    <th className="py-2 pr-3 font-bold">Person</th>
                    <th className="py-2 pr-3 font-bold">Offen</th>
                    <th className="py-2 pr-3 font-bold">Bestätigt</th>
                    <th className="py-2 pr-3 font-bold">Zurückgegeben</th>
                    <th className="py-2 font-bold">Stand</th>
                  </tr>
                </thead>
                <tbody>
                  {personen.map((p) => {
                    const pct = p.gesamt ? Math.round((p.bestaetigt / p.gesamt) * 100) : 0;
                    return (
                      <tr key={p.email} className="border-t border-border">
                        <td className="py-2.5 pr-3 font-semibold">{p.name}</td>
                        <td className="py-2.5 pr-3">{p.offen}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-28 rounded-sm bg-muted">
                              <div className="h-2 rounded-sm bg-status-done" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{p.bestaetigt} · {pct} %</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">{p.zurueck}</td>
                        <td className="py-2.5 font-semibold">
                          {p.offen === 0 ? 'fertig' : p.bestaetigt === 0 ? 'nicht begonnen' : 'läuft'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Block>
      )}

      <Block titel="Im Topf" anzahl={topf.length} hinweis="Zurückgegeben – bitte neu verteilen">
        {topf.length === 0 ? <Leer>Der Topf ist leer.</Leer> : topf.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-semibold text-foreground">{t.title}</p>
              <p className="text-xs text-muted-foreground">
                {projektName(t)}
                {t.zurueck_hinweis ? ` · Hinweis: ${t.zurueck_hinweis}` : ''}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              Geht an
              <select
                defaultValue=""
                disabled={laeuft[t.id]}
                onChange={(e) => e.target.value && tun(t.id, () => verteileNeu(t, e.target.value))}
                className="h-10 rounded border border-[#d4d4d4] bg-white px-2 text-sm text-foreground"
              >
                <option value="">Person wählen</option>
                {members.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}
              </select>
            </label>
          </div>
        ))}
      </Block>

      <Block titel="Zum Archivieren vorgeschlagen" anzahl={vorschlaege.length} hinweis="„Gibt es nicht mehr“ – du entscheidest">
        {vorschlaege.length === 0 ? <Leer>Keine Vorschläge.</Leer> : vorschlaege.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-semibold text-foreground">{t.title}</p>
              <p className="text-xs text-muted-foreground">{projektName(t)} · vorgeschlagen von {nameVon(t.uebernahme_von)}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button" className={knopf} disabled={laeuft[t.id]}
                onClick={() => tun(t.id, async () => {
                  const res = await ticketBereinigen('archivieren', [t.id], 'nicht_mehr_relevant');
                  if (res.abgelehnt.length) throw new Error(res.abgelehnt[0].grund || 'Archivieren abgelehnt');
                })}
              >
                Archivieren
              </button>
              <button type="button" className={knopf} disabled={laeuft[t.id]} onClick={() => tun(t.id, () => vorschlagAblehnen(t))}>
                Bleibt
              </button>
            </div>
          </div>
        ))}
      </Block>

      <Block titel="Wartet auf Feedback" anzahl={wartend.length} hinweis="Längste Wartezeit zuerst – jetzt nachfassen">
        {wartend.length === 0 ? <Leer>Niemand hat „Wartet auf Feedback“ gemeldet.</Leer> : wartend.map((t) => {
          const tage = tageSeit(t.wartet_seit);
          return (
            <div key={t.id} className="border-t border-border py-2.5 first:border-t-0">
              <p className="text-sm font-semibold text-foreground">{t.title}</p>
              <p className="text-xs text-muted-foreground">
                {projektName(t)} · {AUF_LABEL[t.wartet_auf] || 'Kunde'}
                {t.wartet_worauf ? ` · ${t.wartet_worauf}` : ''}
                {tage !== null ? ` · seit ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}` : ''}
                {` · bei ${nameVon(t.assignee_email)}`}
              </p>
            </div>
          );
        })}
      </Block>

      {zeigeFortschritt && (
        <Block titel="Gemeldete Hinweise" anzahl={hinweise.length}>
          {hinweise.length === 0 ? <Leer>Keine Hinweise.</Leer> : hinweise.map((h) => (
            <div key={h.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm text-foreground">{h.text}</p>
                <p className="text-xs text-muted-foreground">
                  {HINWEIS_LABEL[h.art] || h.art} · {nameVon(h.person_email)}
                  {h.project_id && projektById[h.project_id] ? ` · ${projektById[h.project_id].title}` : ''}
                </p>
              </div>
              <button
                type="button" className={knopf} disabled={laeuft[h.id]}
                onClick={() => tun(h.id, () => base44.entities.UebernahmeHinweis.update(h.id, { erledigt: true }))}
              >
                Erledigt
              </button>
            </div>
          ))}
        </Block>
      )}
    </div>
  );
}
