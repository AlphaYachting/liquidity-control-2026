import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import ClientLinkStep from '@/components/crm/handover/ClientLinkStep';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveSupportProject, createSupportTicket, SUPPORT_MODELS, DEFAULT_SUPPORT_RATE } from '@/components/crm/support/supportTicket';
import { descriptionFromThread } from '@/components/crm/support/threadDescription';
import { kundenSchluessel } from '@/lib/kunden/kundeAnlegen';
import { dringlichkeit, faelligAm, SUPPORT_FRIST_TAGE } from '@/components/crm/support/faelligkeit';
import { projectTypeOf, typeStyleOf } from '@/components/sprint/projectTypes';

const ROLES = ['Beratung', 'Konzept', 'Text', 'Grafik', 'Web', 'Media', 'QS'];
// Feste leere Liste — solange die Daten laden, darf die Vorbelegung nicht bei jedem Rendern neu laufen
const KEINE = [];

export default function SupportTicketDialog({ open, onOpenChange, item, onDone }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const queryClient = useQueryClient();
  const { user: ich } = useAuth();
  // Kundensuche statt langer Auswahlliste; fehlt der Kunde, direkt aus sevDesk übernehmen oder anlegen
  const [kundeSuche, setKundeSuche] = useState('');
  const [neuAnlegen, setNeuAnlegen] = useState(false);

  const { data: projects = KEINE } = useQuery({
    queryKey: ['support-projects'],
    queryFn: () => base44.entities.Project.filter(
      { abrechnungsmodell: { $in: SUPPORT_MODELS } }, 'title', 200),
    enabled: open,
  });
  // Kunden kommen aus dem Verzeichnis; ein neuer entsteht nur über den Kunden-Baustein (mit sevDesk)
  const { data: clients = KEINE } = useQuery({
    queryKey: ['support-clients'],
    queryFn: () => base44.entities.Client.list('name', 2000),
    enabled: open,
  });
  const { data: team = [] } = useQuery({
    queryKey: ['team-members-active'],
    queryFn: () => base44.entities.TeamMember.filter({ active: true }, 'name', 100),
    enabled: open,
  });
  // Alle laufenden Projekte des gewählten Kunden — eine Anfrage kann auch in seinen Retainer
  // oder ein laufendes Projekt gehören statt in ein eigenes Support-Projekt (Entscheidung 05.10.2026).
  const { data: kundenProjekte = KEINE } = useQuery({
    queryKey: ['support-kundenprojekte', form?.client_id],
    queryFn: () => base44.entities.Project.filter(
      { client_id: form.client_id, status: { $ne: 'abgeschlossen' } }, 'title', 100),
    enabled: open && !!form?.client_id,
  });

  useEffect(() => {
    if (!open || !item) return;
    const erkannt = item.matched_customer_name || item.sender_name || '';
    const nachName = erkannt ? clients.find(c => kundenSchluessel(c.name) === kundenSchluessel(erkannt)) : null;
    const match = projects.find(p => p.title === `Support — ${nachName?.name || erkannt}`);
    // Kunde: Namenstreffer im Verzeichnis, sonst der Kunde des passenden Support-Projekts
    const kunde = nachName || clients.find(c => c.id === match?.client_id) || null;
    const itemKey = String(item.id || item.thread_id || '');
    const dring = dringlichkeit(item);
    setForm((vorher) => {
      const gleich = vorher?.item_key === itemKey;
      // Hat die Person Kunde oder Projekt schon gewählt, bleibt ihre Auswahl — nachladende Listen überschreiben nichts
      if (gleich && vorher.auswahl_manuell) return vorher;
      // Eingaben (Titel, Text, Zuständig, Fälligkeit …) bleiben erhalten, wenn die Listen später eintreffen
      const basis = gleich ? vorher : {
        // Fälligkeit: 4 Tage, bei dringender Störung sofort
        planned_for: faelligAm(dring.dringend),
        faellig_manuell: false,
        dringend_grund: dring.grund,
        erkannt,
        item_key: itemKey,
        title: (item.subject || 'Support-Anfrage').slice(0, 200),
        description: item.body || '',
        role: 'Web',
        target_hours: 1,
        // Zuständig ist Pflicht (Rückmeldung John 06.10.2026) — vorbelegt mit der Person, die anlegt
        assignee_email: ich?.email || '',
        auswahl_manuell: false,
      };
      return {
        ...basis,
        customer: kunde?.name || '',
        client_id: kunde?.id || '',
        stundensatz: match?.stundensatz || DEFAULT_SUPPORT_RATE,
        project_id: match?.id || '__new__',
      };
    });
    setError(null);
  }, [open, item, projects, clients]);

  // Neue Anfrage: Suchfeld mit dem erkannten Namen vorbelegen
  useEffect(() => {
    if (!open || !item) return;
    setKundeSuche(item.matched_customer_name || item.sender_name || '');
    setNeuAnlegen(false);
  }, [open, item?.id, item?.thread_id]);

  const kundenTreffer = useMemo(() => {
    const q = kundeSuche.trim().toLowerCase();
    if (!q) return [];
    const woerter = q.split(/\s+/).filter(Boolean);
    return clients
      .filter((c) => woerter.every((w) => String(c.name || '').toLowerCase().includes(w)))
      .slice(0, 8);
  }, [clients, kundeSuche]);

  // sevDesk-Suche erscheint von selbst, sobald das Verzeichnis nichts findet — oder auf Klick
  const zeigeSevdesk = !!form && !form.client_id
    && (neuAnlegen || (kundeSuche.trim().length >= 2 && kundenTreffer.length === 0));

  const kundeWaehlen = (c) => {
    setForm((f) => ({ ...f, client_id: c.id, customer: c.name, auswahl_manuell: true }));
    setNeuAnlegen(false);
  };

  // Kunde aus sevDesk übernommen oder neu angelegt — sofort auswählen und in die Liste aufnehmen
  const kundeAusBaustein = (c) => {
    if (!c?.id) return;
    queryClient.setQueryData(['support-clients'], (alt = []) => (alt.some((x) => x.id === c.id) ? alt : [...alt, c]));
    kundeWaehlen(c);
  };

  // Kommt die Anfrage aus der E-Mail-Zentrale, fehlt der Text — Verlauf nachladen.
  useEffect(() => {
    if (!open || !item) return;
    // Nur eine echte Thread-Id zählt — die Id eines Posteingangs-Eintrags ist kein Thread
    const threadId = item.thread_id
      || (String(item.email_message_id || '').startsWith('thread:') ? item.email_message_id.slice(7) : null);
    if (item.body || !threadId) return;
    let cancelled = false;
    setLoadingThread(true);
    descriptionFromThread(threadId)
      .then((text) => {
        if (cancelled || !text) return;
        setForm((f) => {
          if (!f) return f;
          const neu = f.description ? f : { ...f, description: text };
          // Dringlichkeit auch im nachgeladenen Verlauf prüfen
          const dring = dringlichkeit(item, text);
          return dring.dringend && !neu.faellig_manuell && !neu.dringend_grund
            ? { ...neu, planned_for: faelligAm(true), dringend_grund: dring.grund }
            : neu;
        });
      })
      .finally(() => { if (!cancelled) setLoadingThread(false); });
    return () => { cancelled = true; };
  }, [open, item]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await base44.auth.me().catch(() => null);
      const chosen = [...kundenProjekte, ...projects].find(p => p.id === form.project_id);
      const { project_id: projectId, milestone_id: milestoneId } = await resolveSupportProject(
        chosen ? form.customer || (chosen.title || '').replace(/^Support — /, '') : form.customer,
        {
          projectId: chosen?.id,
          pmEmail: chosen?.pm_email || user?.email || '',
          stundensatz: Number(form.stundensatz) || 0,
        },
      );
      const { ticket, back, hinweis } = await createSupportTicket({ item, projectId, milestoneId, values: form });
      setBusy(false);
      onOpenChange(false);
      onDone?.(ticket, back, hinweis);
    } catch (e) {
      setBusy(false);
      setError(e?.response?.data?.detail || e?.message || 'Das Ticket konnte nicht angelegt werden.');
    }
  };

  if (!form) return null;

  // Auswahlliste: zuerst die Projekte des Kunden, danach die übrigen Support-Projekte
  const zielProjekte = [
    ...kundenProjekte,
    ...projects.filter(p => p.status !== 'abgeschlossen' && !kundenProjekte.some(k => k.id === p.id)),
  ];
  const gewaehlt = zielProjekte.find(p => p.id === form.project_id) || null;
  const ausserhalbSupport = !!gewaehlt && !SUPPORT_MODELS.includes(gewaehlt.abrechnungsmodell);
  const retainer = kundenProjekte.find(p => projectTypeOf(p) === 'container');
  const typLabel = (p) => typeStyleOf(p)?.short || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Kopf und Fuß stehen fest, nur der Formularteil scrollt — die Knöpfe bleiben immer erreichbar */}
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0"><DialogTitle>Support-Ticket anlegen</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
          {/* Wer, für wen — Kunde und Zuständig stehen ganz oben */}
          {/* Kunde zuerst und über die ganze Breite: EIN Suchfeld — findet es nichts im Verzeichnis,
              erscheinen darunter sofort die sevDesk-Treffer und „neu anlegen“ zum eingetippten Namen */}
          <div>
            <Label className="text-xs">Kunde</Label>
            {form.client_id ? (
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/40">
                <span className="text-sm truncate flex-1">{form.customer}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Anderen Kunden wählen"
                  onClick={() => { setForm(f => ({ ...f, client_id: '', customer: '', auswahl_manuell: true })); setKundeSuche(''); }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={kundeSuche}
                    onChange={e => setKundeSuche(e.target.value)}
                    placeholder="Kunde suchen …"
                    className="pl-8"
                    autoFocus
                  />
                </div>
                {kundenTreffer.length > 0 && (
                  <div className="mt-1 border rounded-md divide-y max-h-48 overflow-y-auto bg-card">
                    {kundenTreffer.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => kundeWaehlen(c)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-status-attention mt-1">
                  {kundeSuche.trim() && kundenTreffer.length === 0
                    ? `„${kundeSuche.trim()}“ ist kein Kunde im Verzeichnis — unten aus sevDesk übernehmen oder neu anlegen.`
                    : 'Kundennamen eintippen und auswählen. '}
                  {kundenTreffer.length > 0 && (
                    <button type="button" className="underline" onClick={() => setNeuAnlegen(v => !v)}>
                      {neuAnlegen ? 'Suche in sevDesk schließen' : 'Nicht dabei? In sevDesk suchen oder neu anlegen'}
                    </button>
                  )}
                </p>
              </>
            )}
            {item?.customer_match === 'unsicher' && (
              <p className="text-xs text-status-attention mt-1">
                Kundenzuordnung unsicher — bitte prüfen.
              </p>
            )}
          </div>
          {zeigeSevdesk && (
            <ClientLinkStep
              kunde={form.erkannt || ''}
              suchbegriff={kundeSuche.trim()}
              ohneSuchfeld
              deal={{ contact_name: item?.sender_name || '', contact_email: item?.sender_email || '', contact_phone: item?.sender_phone || '' }}
              client={null}
              onClient={kundeAusBaustein}
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Zuständig</Label>
            <Select value={form.assignee_email || undefined}
              onValueChange={v => set('assignee_email', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {team.map(t => <SelectItem key={t.id} value={t.email}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Die Person findet das Ticket in „Mein Tag“.</p>
          </div>
          <div>
            <Label className="text-xs">Ziel-Projekt</Label>
            <Select
              value={form.project_id}
              onValueChange={v => {
                // Bestehendes Support-Projekt gewählt → dessen Kunde wird übernommen
                const kunde = clients.find(c => c.id === projects.find(p => p.id === v)?.client_id);
                setForm(f => ({ ...f, project_id: v, auswahl_manuell: true, ...(kunde ? { client_id: kunde.id, customer: kunde.name } : {}) }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">Support-Projekt des Kunden (neu anlegen)</SelectItem>
                {zielProjekte.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}{typLabel(p) ? ` · ${typLabel(p)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {retainer && form.project_id !== retainer.id && (
              <p className="text-xs text-status-attention mt-1">
                Der Kunde hat den Retainer „{retainer.title}“. Gehört die Anfrage ins Kontingent, diesen auswählen.
              </p>
            )}
          </div>
          </div>
          <div>
            <Label className="text-xs">Titel</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Textarea
              rows={6}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder={loadingThread ? 'Verlauf wird geladen…' : 'Anliegen des Kunden kurz beschreiben'}
            />
            {!loadingThread && !form.description.trim() && (
              <p className="text-xs text-status-attention mt-1">
                Anliegen des Kunden kurz beschreiben — ein Ticket darf nicht nur den Betreff tragen.
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Rolle</Label>
              <Select value={form.role} onValueChange={v => set('role', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Stunden (geschätzt)</Label>
              <Input type="number" step="0.5" value={form.target_hours}
                onChange={e => set('target_hours', e.target.value)} />
            </div>
            {!ausserhalbSupport && (
              <div>
                <Label className="text-xs">Stundensatz</Label>
                <Input type="number" value={form.stundensatz}
                  onChange={e => set('stundensatz', e.target.value)} />
              </div>
            )}
          </div>
          <div className="sm:w-1/2 sm:pr-1.5">
            <Label className="text-xs">Fällig am</Label>
            <Input type="date" value={form.planned_for || ''}
              onChange={e => setForm(f => ({ ...f, planned_for: e.target.value, faellig_manuell: true }))} />
            <p className={`text-xs mt-1 ${form.dringend_grund && !form.faellig_manuell ? 'text-status-attention' : 'text-muted-foreground'}`}>
              {form.faellig_manuell
                ? 'Händisch gesetzt.'
                : form.dringend_grund
                  ? `Dringend erkannt (${form.dringend_grund}) — sofort fällig. Bei Bedarf ändern.`
                  : `Standard: ${SUPPORT_FRIST_TAGE} Tage ab heute.`}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {ausserhalbSupport
              ? `Es wird keine Rechnung ausgelöst. Der gesamte E-Mail-Verlauf wird ins Ticket übernommen. Das Ticket landet in „${gewaehlt.title}“ und wird nicht über die Support-Abrechnung verrechnet.`
              : 'Es wird keine Rechnung ausgelöst. Der gesamte E-Mail-Verlauf wird ins Ticket übernommen. Sobald das Ticket erledigt ist, erscheint die gebuchte Zeit in der Support-Abrechnung.'}
          </p>
        </div>
        <DialogFooter className="px-6 py-3 border-t shrink-0 sm:items-center">
          {error && <p className="text-xs text-destructive sm:mr-auto sm:max-w-[60%]">{error}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
          <Button onClick={submit} disabled={busy || loadingThread || !form.customer || !form.title || !form.description.trim() || !form.assignee_email}>
            {busy ? 'Wird angelegt…' : 'Ticket anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}