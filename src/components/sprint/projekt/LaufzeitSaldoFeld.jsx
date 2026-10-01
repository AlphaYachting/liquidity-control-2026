import React from 'react';
import KennzahlFeld from '@/components/sprint/KennzahlFeld';
import { STATUS_COLORS, fmtDate } from '@/components/sprint/sprintConfig';
import { h1 } from '@/lib/sprint/behaelterZahlen';

// Saldo seit Laufzeitbeginn für Retainer — ein KennzahlFeld im Projektkopf.
// Daten aus useProjektKontext → data.summen.laufzeit (von projektZeitSummen geliefert).
function quelleText(lz) {
  if (lz.beginn_quelle === 'manuell') return 'manuell';
  if (lz.beginn_quelle === 'ab_fallback') return 'aus AB, nicht bestätigt';
  return lz.ab_nummer ? `aus AB ${lz.ab_nummer}` : 'aus AB';
}

function buildTooltip(lz) {
  const lines = [
    `Laufzeitbeginn: ${fmtDate(lz.beginn)} (${quelleText(lz)})`,
    `${lz.monate} × ${h1(lz.kontingent_monat)} h + Übertrag ${h1(lz.uebertrag)} h = ${h1(lz.verfuegbar)} h`,
    `aus aWork übernommen (bis ${fmtDate(lz.stichtag)}): ${h1(lz.gebucht_awork)} h · App: ${h1(lz.gebucht_app)} h`,
  ];
  if (lz.davon_mehrleistung_abgerechnet > 0) {
    lines.push(`davon als Mehrleistung abgerechnet: ${h1(lz.davon_mehrleistung_abgerechnet)} h`);
  }
  if (Array.isArray(lz.historie)) {
    for (const h of lz.historie) {
      lines.push(`Vorperiode ${fmtDate(h.beginn)}–${fmtDate(h.ende)}: Saldo ${h1(h.saldo)} h`);
    }
  }
  return lines.join('\n');
}

export default function LaufzeitSaldoFeld({ laufzeit, loading }) {
  if (loading || !laufzeit) {
    return <KennzahlFeld label="Saldo Laufzeit" value="…" />;
  }

  const {
    beginn, saldo, gebucht, verfuegbar, monate, altstand_fehlt, zukunft,
    kontingent_monat, uebertrag, stichtag, gebucht_awork, gebucht_app,
    davon_mehrleistung_abgerechnet, beginn_quelle, ab_nummer, historie,
  } = laufzeit;

  if (!beginn) {
    return <KennzahlFeld label="Saldo Laufzeit" value="—" hint="Laufzeitbeginn fehlt" />;
  }

  if (zukunft) {
    return <KennzahlFeld label={`Saldo seit ${fmtDate(beginn)}`} value="—" hint={`beginnt am ${fmtDate(beginn)}`} />;
  }

  const value = saldo >= 0 ? `+${h1(saldo)} h` : `−${h1(Math.abs(saldo))} h`;
  const valueColor = saldo >= 0 ? STATUS_COLORS.doneText : STATUS_COLORS.attention;
  const tooltip = buildTooltip(laufzeit);

  if (altstand_fehlt) {
    return (
      <KennzahlFeld
        label={`Saldo seit ${fmtDate(beginn)}`}
        value={value}
        valueColor={valueColor}
        hint="aWork-Stand fehlt – bitte im Projekt eintragen"
        hintColor={STATUS_COLORS.attention}
        tooltip={tooltip}
      />
    );
  }

  const hint = saldo >= 0
    ? `${h1(saldo)} h frei · ${h1(gebucht)} von ${h1(verfuegbar)} h`
    : `${h1(gebucht)} von ${h1(verfuegbar)} h · ${monate} Mon.`;

  return (
    <KennzahlFeld
      label={`Saldo seit ${fmtDate(beginn)}`}
      value={value}
      valueColor={valueColor}
      hint={hint}
      tooltip={tooltip}
    />
  );
}
