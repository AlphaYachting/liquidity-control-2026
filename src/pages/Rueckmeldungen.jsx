import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/AuthContext';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { ARTEN, ART_LABEL, STATUS, STATUS_LABEL, OFFEN, datum, istInhaber, NEU_KEY } from '@/lib/rueckmeldung/rueckmeldung';

const LISTE_KEY = ['rueckmeldungen-alle'];

const STATUS_FILTER = [
  { value: 'offen', label: 'Offen' },
  { value: 'umgesetzt', label: 'Umgesetzt' },
  { value: 'spaeter', label: 'Später' },
  { value: 'abgelehnt', label: 'Nicht umgesetzt' },
  { value: 'alle', label: 'Alle' },
];

function Schalter({ optionen, wert, onWahl, zaehlen }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {optionen.map((o) => {
        const aktiv = o.value === wert;
        const n = zaehlen ? zaehlen(o.value) : null;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onWahl(o.value)}
            className="h-8 px-3 text-[12.5px] font-semibold"
            style={{ borderRadius: 3, border: `1px solid ${aktiv ? RITTLER.black : RITTLER.line}`, backgroundColor: aktiv ? RITTLER.black : RITTLER.white, color: aktiv ? RITTLER.white : RITTLER.black }}
          >
            {o.label}{n !== null ? ` ${n}` : ''}
          </button>
        );
      })}
    </div>
  );
}

function Eintrag({ r, offen, onToggle }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(r.status || 'neu');
  const [antwort, setAntwort] = useState(r.antwort || '');
  const [speichern, setSpeichern] = useState(false);
  const geaendert = status !== (r.status || 'neu') || antwort !== (r.antwort || '');

  const aktualisieren = async (daten) => {
    await base44.entities.Rueckmeldung.update(r.id, { ...daten, bearbeitet_am: new Date().toISOString() });
    queryClient.invalidateQueries({ queryKey: LISTE_KEY });
    queryClient.invalidateQueries({ queryKey: NEU_KEY });
  };

  // Aufklappen = angesehen; damit verschwindet die Meldung aus dem Zähler.
  const aufklappen = async () => {
    onToggle();
    if (!offen && r.status === 'neu') {
      setStatus('angesehen');
      await aktualisieren({ status: 'angesehen' });
    }
  };

  const sichern = async () => {
    setSpeichern(true);
    await aktualisieren({ status, antwort: antwort.trim() });
    setSpeichern(false);
  };

  const istNeu = r.status === 'neu';
  const Pfeil = offen ? ChevronDown : ChevronRight;

  return (
    <div style={{ borderRadius: 3, border: `1px solid ${istNeu ? RITTLER.black : RITTLER.line}`, backgroundColor: RITTLER.white }}>
      <button type="button" onClick={aufklappen} className="w-full text-left flex items-start gap-3 px-4 py-3">
        <Pfeil className="w-4 h-4 mt-0.5 shrink-0" style={{ color: RITTLER.textSecondary }} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[10.5px] font-bold uppercase px-1.5 py-0.5" style={{ letterSpacing: '0.8px', borderRadius: 3, border: `1px solid ${RITTLER.line}`, color: RITTLER.black }}>
              {ART_LABEL[r.art] || r.art}
            </span>
            {r.blockiert && (
              <span className="text-[10.5px] font-bold uppercase px-1.5 py-0.5" style={{ letterSpacing: '0.8px', borderRadius: 3, backgroundColor: STATUS_COLORS.criticalSurface, color: STATUS_COLORS.critical }}>
                Blockiert
              </span>
            )}
            <span className="text-[12px]" style={{ color: RITTLER.textSecondary }}>
              {r.person_name || r.person_email} · {datum(r.created_date)}
            </span>
            {(r.bilder || []).length > 0 && (
              <span className="text-[12px]" style={{ color: RITTLER.textSecondary }}>· {r.bilder.length} Bild{r.bilder.length === 1 ? '' : 'er'}</span>
            )}
          </div>
          <p className={`text-[13.5px] mt-1 whitespace-pre-wrap ${offen ? '' : 'line-clamp-2'}`} style={{ color: RITTLER.black, fontWeight: istNeu ? 600 : 400 }}>
            {r.text}
          </p>
        </div>
        <span className="text-[12px] font-semibold shrink-0" style={{ color: istNeu ? RITTLER.black : RITTLER.textSecondary }}>
          {STATUS_LABEL[status] || status}
        </span>
      </button>

      {offen && (
        <div className="px-4 pb-4 pl-11 space-y-4">
          {(r.bilder || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.bilder.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" title="In voller Größe öffnen">
                  <img src={url} alt="Screenshot" className="h-28 max-w-[220px] object-cover" style={{ borderRadius: 3, border: `1px solid ${RITTLER.line}` }} />
                </a>
              ))}
            </div>
          )}

          <div className="text-[12px] space-y-0.5" style={{ color: RITTLER.textSecondary }}>
            {r.seite && (
              <p>
                Gemeldet auf{' '}
                <Link to={r.seite} className="underline inline-flex items-center gap-1" style={{ color: RITTLER.black }}>
                  {r.seiten_titel && r.seiten_titel !== document.title ? r.seiten_titel : r.seite}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </p>
            )}
            {(r.project_id || r.ticket_id) && (
              <p>Offen war: {r.project_id ? `Projekt ${r.project_id}` : ''}{r.ticket_id ? ` · Ticket ${r.ticket_id}` : ''}</p>
            )}
            <p>{r.person_email}{r.bildschirm ? ` · Fenster ${r.bildschirm}` : ''}</p>
            {r.browser && <p className="truncate" title={r.browser}>{r.browser}</p>}
          </div>

          <div className="space-y-2">
            <Schalter optionen={STATUS.filter((s) => s.value !== 'neu')} wert={status} onWahl={setStatus} />
            <Textarea
              rows={2}
              value={antwort}
              onChange={(e) => setAntwort(e.target.value)}
              placeholder="Antwort an die Person (sieht sie unter „Meine Meldungen“) — optional"
              className="text-[13px]"
              style={{ borderRadius: 3 }}
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!geaendert || speichern}
                onClick={sichern}
                className="h-8 px-4 text-[12.5px] font-bold uppercase tracking-wide flex items-center gap-1.5"
                style={!geaendert || speichern
                  ? { borderRadius: 3, backgroundColor: RITTLER.surface, color: RITTLER.textSecondary, cursor: 'not-allowed' }
                  : { borderRadius: 3, backgroundColor: RITTLER.pink, color: RITTLER.white }}
              >
                {speichern && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Rueckmeldungen() {
  const { user } = useAuth();
  const darf = istInhaber(user);
  const [art, setArt] = useState('alle');
  const [statusFilter, setStatusFilter] = useState('offen');
  const [offenId, setOffenId] = useState(null);

  const { data: alle = [], isLoading } = useQuery({
    queryKey: LISTE_KEY,
    queryFn: () => base44.entities.Rueckmeldung.list('-created_date', 1000),
    enabled: darf,
  });

  const passtStatus = (r, f) => (f === 'alle' ? true : f === 'offen' ? OFFEN.includes(r.status || 'neu') : r.status === f);
  const passtArt = (r, a) => a === 'alle' || r.art === a;

  const liste = useMemo(() => {
    const l = alle.filter((r) => passtArt(r, art) && passtStatus(r, statusFilter));
    // Offene: Blockierende zuerst, dann neue, dann nach Datum
    return l.sort((a, b) =>
      (Number(!!b.blockiert && OFFEN.includes(b.status)) - Number(!!a.blockiert && OFFEN.includes(a.status)))
      || (Number(b.status === 'neu') - Number(a.status === 'neu'))
      || String(b.created_date || '').localeCompare(String(a.created_date || '')));
  }, [alle, art, statusFilter]);

  if (!darf) return null;

  const neuAnzahl = alle.filter((r) => r.status === 'neu').length;

  return (
    <div className="max-w-[960px] mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Rückmeldungen</h1>
        <p className="text-[13px] mt-1" style={{ color: RITTLER.textSecondary }}>
          Fehler, Wünsche und Anregungen der Kollegen. {neuAnzahl > 0 ? `${neuAnzahl} noch nicht angesehen.` : 'Alles angesehen.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Schalter
          optionen={[{ value: 'alle', label: 'Alle' }, ...ARTEN.map((a) => ({ value: a.value, label: a.label }))]}
          wert={art}
          onWahl={setArt}
          zaehlen={(v) => alle.filter((r) => passtArt(r, v) && passtStatus(r, statusFilter)).length}
        />
        <Schalter
          optionen={STATUS_FILTER}
          wert={statusFilter}
          onWahl={setStatusFilter}
          zaehlen={(v) => alle.filter((r) => passtArt(r, art) && passtStatus(r, v)).length}
        />
      </div>

      {isLoading ? <Skeleton className="h-48 w-full" /> : liste.length === 0 ? (
        <p className="text-[13px] py-10 text-center" style={{ color: RITTLER.textSecondary }}>Keine Rückmeldungen in dieser Auswahl.</p>
      ) : (
        <div className="space-y-2">
          {liste.map((r) => (
            <Eintrag key={r.id} r={r} offen={offenId === r.id} onToggle={() => setOffenId(offenId === r.id ? null : r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
