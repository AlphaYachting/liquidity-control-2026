import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, Layers, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MiniZustandskette from '@/components/sprint/MiniZustandskette';
import PersonenStapel from '@/components/sprint/PersonenStapel';
import { initials, personColor } from '@/components/sprint/PersonenChip';
import { TICKET_STATUS_LABELS, fmtDate, fmtEUR } from '@/components/sprint/sprintConfig';
import AufgabeAnlegenDialog from '@/components/sprint/etappen/AufgabeAnlegenDialog';
import AufgabensetDialog from '@/components/sprint/etappen/AufgabensetDialog';
import ZusammenfuehrenDialog from '@/components/sprint/etappen/ZusammenfuehrenDialog';
import { doppelteStandardaufgaben, etappenText } from '@/lib/sprint/doppelteStandardaufgaben';

const kurz = (d) => (d ? fmtDate(d).slice(0, 6) : '—');
const h = (v) => (Number(v) || 0).toLocaleString('de-AT', { maximumFractionDigits: 1 });

const STATUS_STIL = {
  offen: 'text-[#555555] bg-[#F0F0F0]',
  in_arbeit: 'text-status-info bg-status-info-surface',
  wartet: 'text-status-attention bg-status-attention-surface',
  erledigt: 'text-status-done-text bg-status-done-surface',
};

// Etappenkarte der Sprint-Projektseite: Etappen aufklappbar mit ihren Aufgaben,
// Aufgaben und Aufgabensets direkt hinzufügen, für Führungskräfte der Hinweis auf
// doppelt angelegte Standardaufgaben.
export default function EtappenListe({
  project, milestones = [], tickets = [], members = [], timeEntries = [], me,
  startOffenId, darfZusammenfuehren, onChanged, onMeldung,
}) {
  const [offenId, setOffenId] = useState(startOffenId || null);
  const [dialog, setDialog] = useState(null); // 'aufgabe' | 'set' | 'zusammen'
  const [dialogEtappe, setDialogEtappe] = useState(null);

  const vorschlaege = useMemo(
    () => (darfZusammenfuehren ? doppelteStandardaufgaben({ milestones, tickets, timeEntries }) : []),
    [darfZusammenfuehren, milestones, tickets, timeEntries],
  );
  const doppeltAnzahl = vorschlaege.reduce((n, v) => n + v.alte.length, 0);
  const proEtappe = vorschlaege[0]?.alte.length || 0;

  const oeffne = (art, etappeId = null) => { setDialogEtappe(etappeId); setDialog(art); };
  const fertig = (text, etappeId) => {
    if (etappeId) setOffenId(etappeId);
    onMeldung?.(text);
    onChanged?.();
  };

  const personVon = (email) => members.find((m) => m.email === email) || { email, name: email };

  return (
    <section className="bg-card rounded border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-baseline gap-3">
          <h2 className="m-0 text-section uppercase text-muted-foreground">Etappen</h2>
          <span className="text-meta text-muted-foreground">
            {milestones.length} {milestones.length === 1 ? 'Etappe' : 'Etappen'} · {tickets.length} {tickets.length === 1 ? 'Aufgabe' : 'Aufgaben'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded h-8 font-semibold" onClick={() => oeffne('aufgabe')} disabled={!milestones.length}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Aufgabe
          </Button>
          <Button variant="outline" size="sm" className="rounded h-8 font-semibold" onClick={() => oeffne('set')} disabled={!milestones.length}>
            <Layers className="w-3.5 h-3.5 mr-1" /> Aufgabenset
          </Button>
        </div>
      </div>

      {vorschlaege.length > 0 && (
        <div className="mx-5 mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded bg-[#F4F4F4] px-3.5 py-2.5 text-[13px] text-[#444444]">
          <span className="flex-[1_1_380px]">
            Die {etappenText(vorschlaege)} haben je dieselben {proEtappe} Standardaufgaben — {doppeltAnzahl} Aufgaben, nichts gebucht.
          </span>
          <Button variant="outline" size="sm" className="rounded h-[30px] font-semibold" onClick={() => oeffne('zusammen')}>
            Zusammenführen prüfen
          </Button>
        </div>
      )}

      {milestones.length === 0 && (
        <p className="border-t border-border p-10 text-center text-sm text-muted-foreground">Dieser Sprint hat keine Etappen.</p>
      )}

      {milestones.map((m) => {
        const eigene = tickets
          .filter((t) => t.milestone_id === m.id)
          .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
        const done = eigene.filter((t) => t.status === 'erledigt').length;
        const total = eigene.length;
        const pct = total ? (done / total) * 100 : 0;
        let zaehler = `${total} ${total === 1 ? 'Aufgabe' : 'Aufgaben'}`;
        if (done > 0 && done < total) zaehler = `${done} von ${total} erledigt`;
        if (total > 0 && done === total) zaehler = `alle ${total} erledigt`;
        const leute = [...new Set(eigene.map((t) => t.assignee_email).filter(Boolean))].map(personVon);
        const offen = offenId === m.id;
        const freigegeben = m.state === 'freigegeben';

        return (
          <div key={m.id} className="border-t border-[#EEEEEE]">
            <button
              type="button"
              onClick={() => setOffenId(offen ? null : m.id)}
              aria-expanded={offen}
              className={`w-full flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-3.5 text-left ${offen ? 'bg-[#FAFAFA]' : 'bg-card hover:bg-[#FCFCFC]'}`}
            >
              <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${offen ? 'rotate-90' : ''}`} />
              <span className="w-[22px] text-[15px] font-bold text-[#72243E]">{m.order}</span>
              <span className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-foreground">
                  {m.title}
                  {m.is_final_milestone && <span className="ml-2 align-middle rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Letzte Etappe</span>}
                </span>
                <span className="text-meta text-muted-foreground">
                  <strong className={freigegeben ? 'text-status-done-text' : 'text-foreground'}>
                    {fmtEUR(m.milestone_amount)}{freigegeben ? ' freigegeben' : ''}
                  </strong>
                  {' · '}Übergabe {kurz(m.handover_date || m.planned_handover)} · Freeze {kurz(m.feedback_deadline || m.planned_freeze)}
                </span>
              </span>
              <span className="hidden md:flex w-16 shrink-0">
                <PersonenStapel members={leute} currentUserEmail={me?.email} />
              </span>
              <span className="hidden lg:block h-1.5 w-[110px] shrink-0 overflow-hidden rounded-sm bg-[#E6E6E6]">
                <span className="block h-1.5 bg-foreground" style={{ width: `${pct}%` }} />
              </span>
              <span className="hidden sm:block w-[120px] shrink-0 text-right text-meta text-foreground">{zaehler}</span>
              <span className="hidden xl:block shrink-0"><MiniZustandskette state={m.state} /></span>
            </button>

            {offen && (
              <div className="bg-[#FAFAFA] pb-3.5 pl-5 pr-5 sm:pl-[58px]">
                {eigene.length === 0 && (
                  <p className="py-2 text-meta text-muted-foreground">Noch keine Aufgaben in dieser Etappe.</p>
                )}
                {eigene.map((t) => {
                  const p = t.assignee_email ? personVon(t.assignee_email) : null;
                  return (
                    <Link
                      key={t.id}
                      to={`/sprint/milestones/${m.id}`}
                      className="mb-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded border border-[#EEEEEE] bg-card px-3 py-2.5 hover:border-[#D4D4D4]"
                    >
                      <span className="min-w-0 flex-[1_1_260px] text-sm text-foreground">{t.title}</span>
                      {p ? (
                        <span
                          title={p.name}
                          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold uppercase text-white"
                          style={{ backgroundColor: personColor(p) }}
                        >
                          {initials(p.name)}
                        </span>
                      ) : (
                        <span title="nicht zugewiesen" className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-[#999999] text-[10px] text-muted-foreground">?</span>
                      )}
                      <span className="w-10 text-right text-meta text-muted-foreground">{h(t.target_hours)} h</span>
                      <span className={`inline-flex min-w-[78px] justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STIL[t.status] || STATUS_STIL.offen}`}>
                        {TICKET_STATUS_LABELS[t.status] || t.status}
                      </span>
                    </Link>
                  );
                })}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                  <button type="button" onClick={() => oeffne('aufgabe', m.id)} className="inline-flex items-center gap-1.5 py-1.5 text-[13px] font-semibold text-foreground hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Aufgabe in dieser Etappe
                  </button>
                  <button type="button" onClick={() => oeffne('set', m.id)} className="inline-flex items-center gap-1.5 py-1.5 text-[13px] font-semibold text-foreground hover:underline">
                    <Layers className="w-3.5 h-3.5" /> Aufgabenset in dieser Etappe
                  </button>
                  <Link to={`/sprint/milestones/${m.id}`} className="ml-auto inline-flex items-center gap-1 py-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:underline">
                    Etappe öffnen <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <AufgabeAnlegenDialog
        open={dialog === 'aufgabe'}
        onOpenChange={(o) => !o && setDialog(null)}
        milestones={milestones}
        tickets={tickets}
        members={members}
        projectId={project?.id}
        startEtappeId={dialogEtappe}
        onCreated={fertig}
      />
      <AufgabensetDialog
        open={dialog === 'set'}
        onOpenChange={(o) => !o && setDialog(null)}
        milestones={milestones}
        tickets={tickets}
        members={members}
        projectId={project?.id}
        pmEmail={project?.pm_email}
        startEtappeId={dialogEtappe}
        onCreated={fertig}
      />
      {darfZusammenfuehren && (
        <ZusammenfuehrenDialog
          open={dialog === 'zusammen'}
          onOpenChange={(o) => !o && setDialog(null)}
          vorschlaege={vorschlaege}
          projectId={project?.id}
          onDone={(text) => fertig(text)}
        />
      )}
    </section>
  );
}
