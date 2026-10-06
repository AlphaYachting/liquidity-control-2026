import React from 'react';
import Tagesstreifen from '@/components/zeit/Tagesstreifen';
import Tagesbilanz from '@/components/zeit/Tagesbilanz';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { minuteVonIso, uhr, dauerText, MODELL_TEXT, MODELL_FARBE } from '@/lib/zeit/tagesAuswertung';

const TAET = { beratung: 'Beratung', umsetzung: 'Umsetzung', vertrieb: 'Vertrieb', meeting: 'Meeting' };
const QUELLE = { timer: 'Timer', zeile: 'Eingabezeile', luecke: 'aus Lücke', spur: 'aus Spur', korrektur: 'Korrektur' };

const Etikett = ({ children, farbe, flaeche }) => (
  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px] whitespace-nowrap"
    style={{ color: farbe, backgroundColor: flaeche }}>
    {children}
  </span>
);

// Eine Buchung als Zeile — nur lesen. Der Grund für „nicht verrechenbar“ wird hier
// bewusst nicht gezeigt: Nachbesserung ist nie personenbezogen auswertbar.
function Zeile({ b, label, istAwork }) {
  const fenster = b.started_at && b.ended_at
    ? `${uhr(minuteVonIso(b.started_at))}–${uhr(minuteVonIso(b.ended_at))}`
    : 'ohne Uhrzeit';
  const farbe = istAwork ? RITTLER.decorGray : (MODELL_FARBE[b.kategorie] || MODELL_FARBE.intern);
  return (
    <div className={`px-3 py-2.5 ${b.korrektur_zu ? 'pl-8 bg-muted/40' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="w-1 h-9 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: farbe }} />
        <div className="w-[120px] shrink-0">
          <p className="text-sm font-semibold tabular-nums">{fenster}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{(Number(b.duration_minutes) || 0) < 0 ? `−${dauerText(-b.duration_minutes)}` : dauerText(b.duration_minutes)}</p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          <p className="text-xs text-muted-foreground truncate">
            {istAwork ? `aWork${b.type_of_work_name ? ` · ${b.type_of_work_name}` : ''}${b.task_name ? ` · ${b.task_name}` : ''}` : (MODELL_TEXT[b.kategorie] || 'Zeitbuchung')}
            {TAET[b.taetigkeit] ? ` · ${TAET[b.taetigkeit]}` : ''}
            {!istAwork && QUELLE[b.quelle] ? ` · ${QUELLE[b.quelle]}` : ''}
          </p>
          {b.note && <p className="text-xs whitespace-pre-line mt-0.5">{b.note}</p>}
        </div>
        <div className="flex flex-wrap justify-end items-center gap-1.5 shrink-0 max-w-[45%]">
          {b.hinweise.map((h) => <Etikett key={h} farbe={STATUS_COLORS.critical} flaeche={STATUS_COLORS.criticalSurface}>{h}</Etikett>)}
          {(istAwork ? b.is_billable === false : b.verrechenbar === false) && (
            <Etikett farbe={RITTLER.textSecondary} flaeche={RITTLER.surface}>nicht verrechenbar</Etikett>
          )}
          {b.mehrleistung && <Etikett farbe={STATUS_COLORS.attention} flaeche={STATUS_COLORS.attentionSurface}>Mehraufwand</Etikett>}
          {b.ueber_kontingent && <Etikett farbe={STATUS_COLORS.attention} flaeche={STATUS_COLORS.attentionSurface}>über Kontingent</Etikett>}
          {b.korrektur_zu && <Etikett farbe={STATUS_COLORS.attention} flaeche={STATUS_COLORS.attentionSurface}>Korrektur</Etikett>}
          {b.abrechnungsstatus === 'abgerechnet' && <Etikett farbe={STATUS_COLORS.doneText} flaeche={STATUS_COLORS.doneSurface}>abgerechnet</Etikett>}
        </div>
      </div>
    </div>
  );
}

// Der Tag einer Person so, wie sie ihn beim Buchen sieht: Streifen, Bilanz, Buchungen.
export default function AzTagDetail({ tag, projektInfo, aworkLabel }) {
  const istAwork = tag.quelle === 'awork';
  const labelVon = (b) => (istAwork ? aworkLabel(b) : (projektInfo[b.project_id]?.voll || 'Ohne Projekt'));
  const mitZeiten = !istAwork && tag.anzahl > tag.ohneUhrzeit;

  return (
    <div className="space-y-3">
      {istAwork ? (
        <p className="text-meta text-muted-foreground">Aus aWork übernommen — dort gibt es keine Uhrzeiten, daher kein Tagesstreifen.</p>
      ) : (
        <>
          {mitZeiten && (
            <Tagesstreifen
              auswertung={tag.auswertung}
              kuerzelVon={(e) => projektInfo[e.project_id]?.kuerzel || '—'}
              istHeute={false}
              jetztMinute={0}
              nurLesen
            />
          )}
          {tag.geoeffnet && (
            <p className="text-meta text-muted-foreground">
              Tool geöffnet um {new Date(tag.geoeffnet).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} — ab hier zählen die Lücken.
            </p>
          )}
          <Tagesbilanz auswertung={tag.auswertung} />
          {tag.ohneUhrzeit > 0 && (
            <p className="text-meta text-muted-foreground">{tag.ohneUhrzeit} {tag.ohneUhrzeit === 1 ? 'Buchung' : 'Buchungen'} ohne Uhrzeit — erscheinen nicht im Streifen.</p>
          )}
        </>
      )}
      {tag.buchungen.length ? (
        <div className="bg-white rounded border border-border divide-y divide-border">
          {tag.buchungen.map((b) => <Zeile key={b.id || b.awork_entry_id} b={b} label={labelVon(b)} istAwork={istAwork} />)}
        </div>
      ) : (
        <p className="text-meta text-muted-foreground">An diesem Tag ist nichts gebucht.</p>
      )}
    </div>
  );
}
