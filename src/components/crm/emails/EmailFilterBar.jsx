import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Search, Loader2 } from 'lucide-react';
import { EMAIL_THREAD_STATUSES } from '@/components/crm/emails/emailConfig';

export default function EmailFilterBar({ filters, onChange, onApply, loading, showStatus = true }) {
  const set = (k, v) => onChange({ ...filters, [k]: v });
  const submit = (e) => { e.preventDefault(); onApply(); };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Volltextsuche (leer = Konversationsliste)…"
          className="pl-8 h-9"
        />
      </div>
      <Input
        value={filters.customer}
        onChange={(e) => set('customer', e.target.value)}
        placeholder="Kunde…"
        className="h-9 w-40"
      />
      {showStatus && (
        <Select value={filters.status} onValueChange={(v) => set('status', v)}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {Object.entries(EMAIL_THREAD_STATUSES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={filters.days} onValueChange={(v) => set('days', v)}>
        <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="7">Letzte 7 Tage</SelectItem>
          <SelectItem value="14">Letzte 14 Tage</SelectItem>
          <SelectItem value="30">Letzte 30 Tage</SelectItem>
          <SelectItem value="90">Letzte 90 Tage</SelectItem>
          <SelectItem value="365">Letztes Jahr</SelectItem>
          <SelectItem value="all">Alles</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.direction} onValueChange={(v) => set('direction', v)}>
        <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Richtungen</SelectItem>
          <SelectItem value="in">Eingehend</SelectItem>
          <SelectItem value="out">Ausgehend</SelectItem>
          <SelectItem value="intern">Intern</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={loading} className="gap-2 h-9">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        Suchen
      </Button>
    </form>
  );
}