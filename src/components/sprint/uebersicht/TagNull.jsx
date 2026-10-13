import React from 'react';
import { Switch } from '@/components/ui/switch';
import { RITTLER, STATUS_COLORS, fmtEUR } from '@/components/sprint/sprintConfig';
import { h1 } from '@/lib/sprint/behaelterZahlen';

// Tag-Null-Sicht (Testbetrieb, nur Admin): ab dem Sanierungsstichtag zählt jedes Projekt mit Auftragswert neu.
// Die Zahlen kommen fertig aus der Backend-Funktion tagNullUebersicht.

const datumKurz = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '');
const datumLang = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

const AMPEL_FARBE = {
  rot: STATUS_COLORS.critical,
  gelb: STATUS_COLORS.attention,
  gruen: STATUS_COLORS.doneText,
  abrechnen: STATUS_COLORS.doneText,
  kein_massstab: RITTLER.textSecondary,
};

function Kennzahl({ label, wert, unter, farbe }) {
  return (
    <div className="min-w-[130px]">
      <p className="text-[11px] font-bold uppercase tracking-[0.8px]" style={{ color: RITTLER.textSecondary }}>{label}</p>
      <p className="text-[20px] font-bold leading-tight" style={{ color: farbe || RITTLER.black }}>{wert}</p>
      {unter && <p className="text-[12px]" style={{ color: RITTLER.textSecondary }}>{unter}</p>}
    </div>
  );
}

// Summenleiste über der Projektliste
export function TagNullLeiste({ daten, laedt, fehler, an, onAn }) {
  const s = daten?.summen?.laufend;
  const p = daten?.summen?.pausiert;
  const tag = daten?.tag_null || '2026-07-24';

  return (
    <div className="bg-white rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-2.5" style={{ borderBottom: `1px solid ${RITTLER.line}` }}>
        <span className="text-[13px] font-bold uppercase tracking-[1px]" style={{ color: RITTLER.black }}>
          Tag-Null-Sicht ab {datumLang(tag)}
        </span>
        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-muted" style={{ color: RITTLER.textSecondary }}>
          Test · nur Admin
        </span>
        <label className="ml-auto flex items-center gap-2 text-[12px] cursor-pointer select-none" style={{ color: RITTLER.textSecondary }}>
          In der Liste zeigen
          <Switch checked={an} onCheckedChange={onAn} />
        </label>
      </div>

      {laedt && <p className="px-4 py-3 text-[13px]" style={{ color: RITTLER.textSecondary }}>Rechne ab Tag Null …</p>}
      {fehler && !laedt && (
        <p className="px-4 py-3 text-[13px]" style={{ color: STATUS_COLORS.critical }}>
          Tag-Null-Sicht konnte nicht geladen werden: {String(fehler?.message || fehler)}
        </p>
      )}

      {s && !laedt && (
        <div className="px-4 py-3 space-y-3">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Kennzahl label="Noch zu verrechnen" wert={fmtEUR(s.noch_zu_verrechnen)} unter={`seit ${datumKurz(tag)} verrechnet: ${fmtEUR(s.verrechnet_seit)}`} />
            <Kennzahl label="Restbudget ab Tag Null" wert={fmtEUR(s.rest_budget)} unter={`${h1(s.rest_std)} h bei ${daten.stundensatz} €`} />
            <Kennzahl label="Verbraucht seit Tag Null" wert={`${h1(s.std_seit)} h`} unter={`noch gedeckt: ${h1(s.gedeckt_std)} h`} />
            <Kennzahl label="Altlast eingefroren" wert={fmtEUR(s.altlast)} unter={`bis ${datumKurz(tag)} gebucht, nicht verrechnet`} farbe={RITTLER.textSecondary} />
            <Kennzahl
              label="Lage"
              wert={`${s.rot} rot · ${s.gelb} gelb`}
              unter={`${s.abrechnen} fertig, noch abzurechnen`}
              farbe={s.rot ? STATUS_COLORS.critical : RITTLER.black}
            />
          </div>
          <p className="text-[12px]" style={{ color: RITTLER.textSecondary }}>
            {s.projekte} laufende Projekte mit Auftragswert
            {p?.projekte ? ` · pausiert: ${p.projekte} Projekte, ${fmtEUR(p.rest_budget)} Restbudget` : ''}
            {daten.ohne_auftrag ? ` · ${daten.ohne_auftrag} laufende Pauschalprojekte ohne Auftragswert` : ''}
            {s.altforderung ? ` · Altforderungen vor Tag Null offen: ${fmtEUR(s.altforderung)}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

// Zelle in der Projektzeile — ersetzt in der Tag-Null-Sicht die Gesamtbudget-Angabe
export function TagNullZelle({ t, tag }) {
  const farbe = AMPEL_FARBE[t.ampel] || RITTLER.black;
  const zeilen = [
    t.aussage,
    t.auftrag ? `Auftrag ${fmtEUR(t.auftrag)} · bis ${datumKurz(tag)} verrechnet ${fmtEUR(t.verrechnet_vor)} · seither ${fmtEUR(t.verrechnet_seit)}` : null,
    t.auftrag ? `Noch zu verrechnen ${fmtEUR(t.noch_zu_verrechnen)}` : null,
    t.altlast != null ? `Altlast eingefroren ${fmtEUR(t.altlast)} (${h1(t.std_vor)} h bis ${datumKurz(tag)})` : null,
    t.letzte_buchung ? `Letzte Buchung ${datumKurz(t.letzte_buchung)}` : 'Seit Tag Null keine Buchung',
    ...(t.hinweise || []),
  ].filter(Boolean).join('\n');

  let oben;
  if (t.ampel === 'kein_massstab') oben = 'kein Auftragswert';
  else if (t.ampel === 'abrechnen') oben = `fertig · ${fmtEUR(t.noch_zu_verrechnen)} abrechnen`;
  else if (t.gedeckt_std < 0) oben = `${h1(-t.gedeckt_std)} h ungedeckt`;
  else oben = `${h1(t.gedeckt_std)} h gedeckt`;

  const unten = t.ampel === 'kein_massstab'
    ? `seit ${datumKurz(tag)}: ${h1(t.std_seit)} h`
    : `seit ${datumKurz(tag)}: ${h1(t.std_seit)} von ${h1(t.rest_std)} h`;

  return (
    <div title={zeilen}>
      <p className="text-[13px] font-semibold truncate" style={{ color: farbe }}>{oben}</p>
      <p className="text-[12px] truncate" style={{ color: RITTLER.textSecondary }}>{unten}</p>
    </div>
  );
}
