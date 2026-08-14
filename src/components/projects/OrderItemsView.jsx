import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import Sektion from '@/components/projects/Sektion';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { ExternalLink, ListOrdered } from 'lucide-react';
import { formatCurrency } from '@/lib/liquidityUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const STATUS_CONFIG = {
  not_started: { label: 'Nicht begonnen', className: 'bg-gray-100 text-gray-600' },
  in_progress:  { label: 'In Arbeit',      className: 'bg-blue-100 text-blue-700' },
  completed:    { label: 'Fertig',          className: 'bg-emerald-100 text-emerald-700' },
  blocked:      { label: 'Blockiert',       className: 'bg-red-100 text-red-700' },
};

export default function OrderItemsView({ linkedOrders }) {
  const queryClient = useQueryClient();
  const orderIds = linkedOrders.map(o => o.id);

  const updateItemMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.ConfirmedOrderItem.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orderItems', ...orderIds] }),
  });

  // Gefilterte Abfrage pro Order-ID — keine Vollabfrage aller Items
  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['orderItems', ...orderIds],
    queryFn: async () => {
      const results = await Promise.all(
        orderIds.map(oid =>
          base44.entities.ConfirmedOrderItem.filter({ confirmed_order_id: oid })
        )
      );
      return results.flat();
    },
    enabled: orderIds.length > 0,
    select: (items) => items
      .filter(i => !i.is_discount)
      .sort((a, b) => (a.position || 0) - (b.position || 0)),
  });

  if (linkedOrders.length === 0 || isLoading) return null;

  // Group items by order
  const grouped = linkedOrders.map(order => ({
    order,
    items: allItems.filter(i => i.confirmed_order_id === order.id),
  })).filter(g => g.items.length > 0);

  if (grouped.length === 0) return null;

  return (
    <Sektion titel="Leistungspositionen aus Auftragsbestätigung" symbol={ListOrdered}>
        {grouped.map(({ order, items }) => (
          <div key={order.id}>
            {linkedOrders.length > 1 && (
              <p className="text-xs text-muted-foreground font-medium mb-2">
                {order.project_name || order.order_number}
              </p>
            )}
            <div className="space-y-1.5">
              {items.map(item => {
              const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.not_started;
              return (
                <div key={item.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                  <span className="text-xs text-muted-foreground w-5 flex-shrink-0">
                    {item.position}.
                  </span>
                  <span className="flex-1 text-sm min-w-0 truncate" title={item.title}>
                    {item.title}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className={`text-xs px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${cfg.className}`}>
                        {cfg.label}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                        <DropdownMenuItem key={key} onClick={() => updateItemMutation.mutate({ id: item.id, status: key })}>
                          <span className={`w-2 h-2 rounded-full mr-2 inline-block ${val.className.split(' ')[0]}`} />
                          {val.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="text-sm font-medium flex-shrink-0 text-right w-24">
                    {formatCurrency(item.total_price)}
                  </span>
                </div>
              );
              })}
            </div>
            <div className="flex justify-end mt-2">
              <Link
                to={`/confirmed-orders/${order.id}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                In der AB bearbeiten
              </Link>
            </div>
          </div>
        ))}
    </Sektion>
  );
}