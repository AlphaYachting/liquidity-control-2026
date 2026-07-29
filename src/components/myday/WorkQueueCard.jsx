import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check } from 'lucide-react';

const TONE = {
  red: 'bg-red-50 text-red-700 border-red-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// Eine Arbeitsliste in "Mein Tag": Was liegt an, wie viel, und wo erledige ich es.
export default function WorkQueueCard({ title, icon: Icon, tone = 'blue', items = [], to, ctaLabel = 'Öffnen', renderItem, max = 5 }) {
  const count = items.length;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
            {title}
          </CardTitle>
          <Badge className={`border ${TONE[tone]} ${count === 0 ? 'opacity-60' : ''}`}>{count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-2">
        {count === 0 ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-2">
            <Check className="w-3.5 h-3.5 text-emerald-600" /> Nichts offen
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.slice(0, max).map((item, i) => (
              <div key={item.id || i} className="text-xs rounded-md bg-muted/50 px-2.5 py-2 leading-snug">
                {renderItem(item)}
              </div>
            ))}
            {count > max && (
              <p className="text-[11px] text-muted-foreground pl-1">+ {count - max} weitere</p>
            )}
          </div>
        )}
        {to && (
          <Button asChild variant="ghost" size="sm" className="mt-auto justify-between text-xs h-8 px-2">
            <Link to={to}>
              {ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}