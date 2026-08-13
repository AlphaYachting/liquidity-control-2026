import React from 'react';
import { Card } from '@/components/ui/card';

export default function ContinuationExplainer() {
  return (
    <Card className="p-4">
      <h3 className="text-xs font-bold">Was diese Rechnung enthält — und was bewusst nicht</h3>
      <div className="text-[11px] text-muted-foreground mt-2 space-y-2 leading-relaxed">
        <p>
          <span className="font-semibold text-foreground">Enthalten sind</span> ausschließlich Einzahlungen aus Leistungen, die ab dem
          Stichtag erbracht werden — bei gemischten Positionen nur der Neuanteil —, sowie sämtliche Auszahlungen, die als
          Masseverbindlichkeit des fortgeführten Betriebs anfallen. Die Wochenverteilung folgt den hinterlegten Zahlungsstaffeln
          bzw. den fest gesetzten Planwochen der einzelnen Positionen.
        </p>
        <p>
          <span className="font-semibold text-foreground">Nicht enthalten sind</span> Altforderungen und Altanteile gemischter
          Positionen, der Kontostand zu Planbeginn sowie sämtliche Zahlungseingänge, die auf Leistungen vor dem Stichtag zurückgehen.
          Diese Beträge stünden der Masse auch ohne Fortführung zu; sie beweisen nichts über die Selbsttragfähigkeit des Betriebs.
          Ebenfalls außerhalb des Basisplans stehen Verwalterentlohnung, Verfahrenskosten und Geschäftsführerbezug — sie werden
          gesondert im Szenarioblock ausgewiesen, weil ihre Höhe nicht vom Unternehmen bestimmt wird.
        </p>
        <p>
          <span className="font-semibold text-foreground">Warum die Deckungsquote hier niedriger ausfällt als in der
          Gesamtliquidität:</span> Die 13-Wochen-Vorschau stellt alle Einzahlungen den Auszahlungen gegenüber, also auch die
          Eingänge auf Altforderungen. Diese Seite lässt sie weg. Das ist die strenge Lesart. Ein Nachweis, den der Verwalter
          selbst erst um die Altpositionen kürzen muss, verliert genau in dem Moment seine Wirkung.
        </p>
      </div>
    </Card>
  );
}