import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fmtEUR } from '@/components/sprint/sprintConfig';
import AbLinks from '@/components/projekt/AbLinks';
import UmfangPositionZeile from '@/components/projekt/UmfangPositionZeile';
import { abStatus, hatUmfang, fmtTag } from '@/lib/crm/abStatus';

const Kennzeile = ({ label, wert }) => (
  <div><span className="text-muted-foreground">{label}: </span><span className="font-medium">{wert ?? '—'}</span></div>
);

// Was ist beauftragt — reine Anzeige, bearbeitet wird in der AB
export default function AuftragsumfangKarte({ order, ohneStatus = false }) {
  const { data: items = [] } = useQuery({
    queryKey: ['projektAbrechnung', 'umfangPositionen', order.id],
    queryFn: () => base44.entities.ConfirmedOrderItem.filter({ confirmed_order_id: order.id }),
    select: (rows) => rows.filter((i) => !i.is_discount).sort((a, b) => (a.position || 0) - (b.position || 0)),
  });
  const st = abStatus(order.status);
  const abLink = <Link to={`/confirmed-orders/${order.id}`} className="text-xs text-primary hover:underline">In der AB bearbeiten</Link>;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Vereinbart laut AB {order.order_number || '—'}</span>
          <span className="text-muted-foreground">· {fmtEUR(order.total_net_amount)} netto</span>
          <span className={`text-xs px-2 py-0.5 rounded ${st.className}`}>{st.label}</span>
        </div>
        <AbLinks order={order} />
      </div>
      <div className="px-4 py-3 space-y-4 text-sm">
        {!hatUmfang(order, items) ? (
          <p className="text-muted-foreground">Für diesen Auftrag ist kein Umfang hinterlegt. {abLink}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-meta">
              <Kennzeile label="Korrekturschleifen je Leistungspaket" wert={order.korrekturschleifen} />
              <Kennzeile label="Leistungszeitraum" wert={order.leistungszeitraum || null} />
              <Kennzeile label="Liefertermin" wert={fmtTag(order.liefertermin) || null} />
            </div>
            {items.length > 0 && (
              <div>{items.map((i) => <UmfangPositionZeile key={i.id} item={i} auftragSchleifen={order.korrekturschleifen} ohneStatus={ohneStatus} />)}</div>
            )}
            {order.nicht_enthalten?.length > 0 && (
              <div>
                <p className="text-label text-muted-foreground mb-1">Nicht enthalten</p>
                <ul className="list-disc pl-5 text-meta space-y-0.5">{order.nicht_enthalten.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {order.mehrkosten_regel && (
              <div>
                <p className="text-label text-muted-foreground mb-1">Mehraufwand</p>
                <p className="text-meta whitespace-pre-line">{order.mehrkosten_regel}</p>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-border text-xs text-muted-foreground">
        <span>{order.umfang_geprueft_von ? `Geprüft von ${order.umfang_geprueft_von} am ${fmtTag(order.umfang_geprueft_am)}` : 'Umfang noch nicht geprüft'}</span>
        {abLink}
      </div>
    </div>
  );
}