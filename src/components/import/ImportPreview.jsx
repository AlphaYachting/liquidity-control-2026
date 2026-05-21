import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

function classifyRow(row) {
  const issues = [];
  if (!row.customer && !row.supplier && !row.customer_or_supplier && !row.tool_name) issues.push('missing_key');
  const amountFields = ['total_net_amount', 'amount_net', 'net_amount', 'gross_amount', 'annual_cost', 'monthly_fixed_price'];
  const hasAmount = amountFields.some(f => row[f] && Number(row[f]) > 0);
  if (!hasAmount) issues.push('missing_amount');
  return issues.length === 0 ? 'new' : issues[0];
}

const STATUS_CONFIG = {
  new: { label: 'Neu', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  missing_key: { label: 'Fehlt Zuordnung', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  missing_amount: { label: 'Kein Betrag', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
};

export default function ImportPreview({ data, onCommit, onCancel }) {
  const [selected, setSelected] = useState(new Set(data.rows.map((_, i) => i)));

  const toggleRow = (idx) => {
    setSelected(s => {
      const next = new Set(s);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(s => s.size === data.rows.length ? new Set() : new Set(data.rows.map((_, i) => i)));
  };

  const columns = data.rows.length > 0 ? Object.keys(data.rows[0]).filter(k => !k.startsWith('_')).slice(0, 8) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Import-Vorschau: {data.sheet}</span>
          <Badge className="bg-blue-100 text-blue-700">{data.rows.length} Zeilen</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10">
                  <Checkbox checked={selected.size === data.rows.length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="w-24">Status</TableHead>
                {columns.map(c => <TableHead key={c} className="text-xs">{c}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, idx) => {
                const status = classifyRow(row);
                const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;
                const Icon = config.icon;
                return (
                  <TableRow key={idx} className={selected.has(idx) ? '' : 'opacity-50'}>
                    <TableCell><Checkbox checked={selected.has(idx)} onCheckedChange={() => toggleRow(idx)} /></TableCell>
                    <TableCell><Badge className={config.color}><Icon className="w-3 h-3 mr-1" />{config.label}</Badge></TableCell>
                    {columns.map(c => (
                      <TableCell key={c} className="text-xs max-w-[150px] truncate">{row[c] != null ? String(row[c]) : '—'}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={onCancel}>Abbrechen</Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selected.size} von {data.rows.length} ausgewählt</span>
          <Button onClick={() => onCommit(data.rows.filter((_, i) => selected.has(i)))}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> {selected.size} Zeilen importieren
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}