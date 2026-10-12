import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Cog, StickyNote, Paperclip, Loader2, X, ListChecks, History } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const zeit = (d) =>
  d ? new Date(d).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

// aWork speichert Kommentare als HTML — in reinen Text mit Zeilenumbrüchen umwandeln.
// DOMParser führt nichts aus, er liest nur den Text und löst Zeichen wie &nbsp; auf.
const htmlZuText = (s) => {
  if (!/[<&]/.test(s)) return s;
  const markiert = s
    .replace(/<[^>]*$/, '') // abgeschnittenes Tag am Ende des Auszugs
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|blockquote|tr)>/gi, '\n');
  try {
    return new DOMParser().parseFromString(markiert, 'text/html').body.textContent || '';
  } catch {
    return markiert.replace(/<[^>]+>/g, '');
  }
};

// aWork-Verweise (~[userId:…], ~[fileId:…]) und HTML sind ohne aWork nicht lesbar.
const bereinige = (t) => htmlZuText(String(t || ''))
  .replace(/~\[userId:[^\]]+\]/g, '@')
  .replace(/~\[fileId:[^\]]+\]/g, '[Datei]')
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// Eine Abfrage für Reiter-Zähler und Verlauf — gleicher Schlüssel, daher nur einmal geladen.
export function useProjektKommentare(projectId) {
  return useQuery({
    enabled: !!projectId,
    queryKey: ['comments', projectId],
    queryFn: () => base44.entities.Comment.filter({ project_id: projectId }, '-created_date', 1000),
    staleTime: 60 * 1000,
  });
}

// Kommentare aus der aWork-Zeit (eingefrorene Sicherung) — nur lesend, zehn Minuten zwischengespeichert.
// Läuft im Hintergrund und hält das Laden der Seite nicht auf.
export const AWORK_LIMIT = 200;
export function useAworkKommentare(aworkProjectId) {
  return useQuery({
    enabled: !!aworkProjectId,
    queryKey: ['aworkKommentare', aworkProjectId],
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await base44.functions.invoke('aworkArchivApi', {
        action: 'akte',
        params: { project_id: aworkProjectId, art: 'comment', neueste_zuerst: true, limit: AWORK_LIMIT, zeichen: 2000 },
      });
      if (res?.data?.error) throw new Error(res.data.error);
      return res?.data?.rows || [];
    },
  });
}

// Zählt, was Kollegen geschrieben haben — in der App und in der aWork-Zeit, ohne automatische Statuszeilen.
export const zaehleKommentare = (liste = [], aworkListe = []) => {
  const anzahl = liste.filter((c) => c.author_email !== 'System').length + aworkListe.length;
  return aworkListe.length >= AWORK_LIMIT ? `${anzahl}+` : anzahl;
};

// Kommentare & Notizen des Projekts — die ganze Geschichte an einem Platz:
// Notizen zum Projekt, alle Kommentare aus den Aufgaben darunter (mit Aufgabe),
// und die Kommentare aus der aWork-Zeit vor der Umstellung. Neueste oben.
// Automatische Statuszeilen sind ausgeblendet und lassen sich einblenden.
export default function ProjektKommentare({ projectId, aworkProjectId, members = [] }) {
  const [text, setText] = useState('');
  const [datei, setDatei] = useState(null);
  const [saving, setSaving] = useState(false);
  const [systemZeigen, setSystemZeigen] = useState(false);
  const fileRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  // Alle Kommentare des Projekts — Projektnotizen und Aufgaben-Kommentare tragen dieselbe project_id.
  const { data: kommentare = [], isLoading } = useProjektKommentare(projectId);

  // Aufgabentitel — auch archivierte Aufgaben, damit ältere Kommentare zuordenbar bleiben.
  const ticketIds = useMemo(
    () => [...new Set(kommentare.map((c) => c.ticket_id).filter(Boolean))],
    [kommentare],
  );
  const { data: aufgaben = [] } = useQuery({
    enabled: ticketIds.length > 0,
    queryKey: ['kommentarAufgaben', projectId, ticketIds.join(',')],
    queryFn: () => base44.entities.Ticket.filter({ id: { $in: ticketIds } }, 'order', 1000),
    staleTime: 5 * 60 * 1000,
  });
  const titelJeAufgabe = useMemo(() => Object.fromEntries(aufgaben.map((t) => [t.id, t.title])), [aufgaben]);

  // Kommentare aus der aWork-Zeit (eingefrorene Sicherung) — nur lesend.
  const { data: awork, isError: aworkFehler, isLoading: aworkLaedt } = useAworkKommentare(aworkProjectId);

  const nameVon = (email) => members.find((m) => m.email === email)?.name || email;

  const eintraege = useMemo(() => {
    const app = kommentare.map((c) => ({
      id: c.id,
      quelle: 'app',
      system: c.author_email === 'System',
      wer: c.author_email === 'System' ? 'System' : nameVon(c.author_email),
      wann: c.created_at || c.created_date,
      text: bereinige(c.text),
      aufgabe: c.ticket_id ? (titelJeAufgabe[c.ticket_id] || 'Aufgabe') : null,
      file_url: c.file_url,
      file_name: c.file_name,
    }));
    const alt = (awork || []).map((r) => ({
      id: `aw-${r.id}`,
      quelle: 'awork',
      system: false,
      wer: 'aWork',
      wann: r.at,
      text: bereinige(r.auszug),
      aufgabe: r.titel ? bereinige(r.titel) : null,
    }));
    return [...app, ...alt].sort((a, b) => String(b.wann || '').localeCompare(String(a.wann || '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kommentare, awork, titelJeAufgabe, members]);

  const anzahlSystem = eintraege.filter((e) => e.system).length;
  const sichtbar = systemZeigen ? eintraege : eintraege.filter((e) => !e.system);

  const senden = async () => {
    const inhalt = text.trim();
    if (!inhalt && !datei) return;
    setSaving(true);
    let file_url;
    if (datei) {
      const res = await base44.integrations.Core.UploadFile({ file: datei });
      file_url = res.file_url;
    }
    await base44.entities.Comment.create({
      project_id: projectId,
      author_email: me?.email || 'unbekannt',
      text: inhalt || datei.name,
      file_url,
      file_name: datei?.name,
      created_at: new Date().toISOString(),
    });
    setText('');
    setDatei(null);
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['comments', projectId] });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Notiz zum Projekt schreiben…"
          className="text-[13px]"
        />
        {datei && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Paperclip className="w-3 h-3" /> {datei.name}
            <button onClick={() => setDatei(null)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
          </p>
        )}
        <div className="flex justify-between">
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => setDatei(e.target.files?.[0] || null)} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Paperclip className="w-3.5 h-3.5 mr-1.5" /> Dokument
          </Button>
          <Button onClick={senden} disabled={saving || (!text.trim() && !datei)} size="sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
            Speichern
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>
          Notizen zum Projekt und alle Kommentare aus den Aufgaben — neueste oben.
          {aworkProjectId && (aworkLaedt ? ' aWork-Kommentare werden geladen …'
            : aworkFehler ? ' aWork-Kommentare gerade nicht erreichbar.' : '')}
        </span>
        {anzahlSystem > 0 && (
          <button type="button" onClick={() => setSystemZeigen((v) => !v)} className="hover:text-foreground hover:underline">
            {systemZeigen ? 'Systemeinträge ausblenden' : `Systemeinträge einblenden (${anzahlSystem})`}
          </button>
        )}
      </div>

      <div>
        {isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Lade Verlauf …</p>}
        {!isLoading && sichtbar.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Noch keine Einträge.</p>
        )}
        {sichtbar.map((e, i) => {
          const Icon = e.system ? Cog : e.quelle === 'awork' ? History : StickyNote;
          const farbe = e.system
            ? 'bg-muted text-muted-foreground'
            : e.quelle === 'awork' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-600';
          return (
            <div key={e.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`p-1.5 rounded-full shrink-0 ${farbe}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                {i < sichtbar.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
              </div>
              <div className="pb-5 min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{e.wer}</p>
                  <span className="text-[11px] text-muted-foreground shrink-0">{zeit(e.wann)}</span>
                </div>
                {e.aufgabe && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-foreground/70">
                    <ListChecks className="w-3 h-3" />
                    {e.quelle === 'awork' ? 'aWork' : 'Aufgabe'}: {e.aufgabe}
                  </p>
                )}
                <p className={`text-xs mt-0.5 whitespace-pre-wrap ${e.system ? 'italic text-muted-foreground' : 'text-muted-foreground'}`}>
                  {e.text}
                </p>
                {e.file_url && (
                  <a href={e.file_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-[11px] text-primary hover:underline">
                    <Paperclip className="w-3 h-3" /> {e.file_name || 'Dokument'}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
