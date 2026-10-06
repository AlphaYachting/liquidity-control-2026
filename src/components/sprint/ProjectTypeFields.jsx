import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MODEL_OPTIONS } from '@/components/sprint/projectTypes';
import ContainerLaufzeitFelder from '@/components/sprint/ContainerLaufzeitFelder';
import KontingentSperreSchalter from '@/components/sprint/KontingentSperreSchalter';
import PauschalBudgetFelder from '@/components/sprint/PauschalBudgetFelder';

// Zusatzfelder je Projekttyp — nur was der Typ wirklich braucht.
export default function ProjectTypeFields({ type, form, setForm, contracts = [], project, abVorschlag, user }) {
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  if (type === 'sprint') {
    return <p className="text-xs text-muted-foreground">Sprint im Assistenten planen — Termine und Etappen entstehen dort.</p>;
  }

  return (
    <>
      {(type === 'support' || type === 'regie') && (
        <div>
          <Label>Stundensatz (EUR)</Label>
          <Input type="number" value={form.stundensatz || ''} onChange={(e) => set('stundensatz')(e.target.value)} />
        </div>
      )}
      {(type === 'support' || type === 'regie') && (
        <div>
          <Label>Monatsrahmen in Stunden (optional)</Label>
          <Input type="number" value={form.support_kontingent_stunden || ''} onChange={(e) => set('support_kontingent_stunden')(e.target.value)} />
        </div>
      )}

      {type === 'intern' && (
        <div>
          <Label>Monatskontingent in Stunden</Label>
          <Input
            type="number"
            value={form.support_kontingent_stunden ?? ''}
            onChange={(e) => set('support_kontingent_stunden')(e.target.value)}
          />
        </div>
      )}

      {type === 'container' && (
        <>
          <div>
            <Label>Kontingent-Stunden pro Monat</Label>
            <Input
              type="number"
              value={form.support_kontingent_stunden || ''}
              onChange={(e) => set('support_kontingent_stunden')(e.target.value)}
            />
          </div>
          <ContainerLaufzeitFelder form={form} setForm={setForm} project={project} abVorschlag={abVorschlag} user={user} />
          <div>
            <Label>Laufender Vertrag (optional)</Label>
            <Select value={form.recurring_contract_id || 'none'} onValueChange={(v) => set('recurring_contract_id')(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Kein Vertrag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Vertrag</SelectItem>
                {contracts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.customer || c.domain || c.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {['container', 'support', 'regie', 'intern'].includes(type) && (
        <KontingentSperreSchalter form={form} setForm={setForm} user={user} />
      )}

      {type === 'legacy' && (
        <PauschalBudgetFelder
          betrag={form.total_budget}
          stunden={form.target_hours}
          onChange={({ betrag, stunden }) => setForm((f) => ({ ...f, total_budget: betrag, target_hours: stunden }))}
          sperre={form.kontingent_sperre}
          onSperre={(v) => setForm((f) => ({ ...f, kontingent_sperre: v }))}
          istAdmin={user?.role === 'admin'}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {type === 'legacy'
          ? 'Pauschalprojekt: fester Auftragswert, ohne Sprintplanung und ohne Pakete — Tickets können direkt abgelegt werden.'
          : 'Es entsteht sofort eine laufende Betreuung ohne Termin und ohne Betrag — Tickets können direkt abgelegt werden.'}
      </p>
    </>
  );
}