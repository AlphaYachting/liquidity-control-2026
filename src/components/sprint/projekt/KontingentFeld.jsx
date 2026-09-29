import React from 'react';
import KennzahlFeld from '@/components/sprint/KennzahlFeld';
import { STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { h1 } from '@/lib/sprint/behaelterZahlen';

// Monatskontingent: gebuchte Stunden von support_kontingent_stunden
export default function KontingentFeld({ label, gebucht, kontingent }) {
  if (!kontingent) return <KennzahlFeld label={label} value={`${h1(gebucht)} h`} />;
  const quote = gebucht / kontingent;
  const farbe = quote > 1 ? STATUS_COLORS.critical : quote >= 0.8 ? STATUS_COLORS.attention : undefined;
  return (
    <KennzahlFeld
      label={label}
      value={`${h1(gebucht)} von ${h1(kontingent)} h`}
      valueColor={farbe}
      hint={`${Math.round(quote * 100)} % verbraucht`}
      hintColor={farbe}
    />
  );
}