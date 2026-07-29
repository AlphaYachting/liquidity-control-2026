import React from 'react';
import { Sun, Loader2, ClipboardCheck, CalendarCheck, AlertTriangle, Gauge, Siren, Inbox, CreditCard } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import WorkQueueCard from '@/components/myday/WorkQueueCard';
import MyDayScopeBar from '@/components/myday/MyDayScopeBar';
import { useMyDayQueues } from '@/hooks/useMyDayQueues';

const eur = (n) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

export default function MyDay() {
  const q = useMyDayQueues();

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Arbeitsliste wird zusammengestellt...
      </div>
    );
  }

  const totalOpen =
    q.progressToCheck.length + q.riskProjects.length + q.openInstructions.length +
    q.plansToReview.length + q.dunningDrafts.length + q.newDeals.length + q.escalations.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mein Tag"
        subtitle="Alles, was heute eine Entscheidung von dir braucht"
        icon={Sun}
      />

      <MyDayScopeBar scope={q.scope} projectCount={q.myProjectCount} totalOpen={totalOpen} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <WorkQueueCard
          title="Fortschritt bestätigen"
          icon={Gauge}
          tone="amber"
          items={q.progressToCheck}
          to="/projects"
          ctaLabel="Zum Projekt-Cockpit"
          renderItem={(p) => (
            <>
              <span className="font-medium">{p.customer}</span> · {p.project_name}
              <span className="text-muted-foreground"> — awork {Math.round(p.awork_progress_percent || 0)} %</span>
            </>
          )}
        />

        <WorkQueueCard
          title="Abrechnung planen"
          icon={CalendarCheck}
          tone="blue"
          items={q.plansToReview}
          to="/next-month-forecast"
          ctaLabel="Zum Abrechnungsforecast"
          renderItem={(p) => (
            <>
              <span className="font-medium">{eur(p.planned_amount_net)}</span> netto geplant
              <span className="text-muted-foreground"> — {p.planned_invoice_type} · {p.billing_status}</span>
            </>
          )}
        />

        <WorkQueueCard
          title="Anweisungen freigeben"
          icon={ClipboardCheck}
          tone="violet"
          items={q.openInstructions}
          to="/invoice-ready"
          ctaLabel="Zu den Abrechnungsanweisungen"
          renderItem={(i) => (
            <>
              <span className="font-medium">{i.customer_name || i.project_name}</span>
              <span className="text-muted-foreground"> — {eur(i.instruction_amount_net)} netto</span>
            </>
          )}
        />

        <WorkQueueCard
          title="Risiko-Projekte"
          icon={AlertTriangle}
          tone="red"
          items={q.riskProjects}
          to="/escalation-alerts"
          ctaLabel="Zu den Eskalations-Alerts"
          renderItem={(p) => (
            <>
              <span className="font-medium">{p.customer}</span> · {p.project_name}
              <span className="text-muted-foreground"> — Risiko {p.risk_status}</span>
            </>
          )}
        />

        <WorkQueueCard
          title="Kunden-Eskalationen"
          icon={Siren}
          tone="red"
          items={q.escalations}
          to="/crm/alerts"
          ctaLabel="Zu den Kommunikations-Alerts"
          renderItem={(t) => (
            <>
              <span className="font-medium">{t.customer || 'Unbekannt'}</span>
              <span className="text-muted-foreground"> — {t.subject}</span>
            </>
          )}
        />

        {q.scope.hasArea('sales') && (
          <WorkQueueCard
            title="Neue Anfragen"
            icon={Inbox}
            tone="emerald"
            items={q.newDeals}
            to="/crm"
            ctaLabel="Zur Pipeline"
            renderItem={(d) => (
              <>
                <span className="font-medium">{d.company_name || d.title}</span>
                <span className="text-muted-foreground"> — {eur(d.value_net)} Potenzial</span>
              </>
            )}
          />
        )}

        {q.scope.hasArea('backoffice') && (
          <WorkQueueCard
            title="Mahnungen freigeben"
            icon={CreditCard}
            tone="amber"
            items={q.dunningDrafts}
            to="/receivables"
            ctaLabel="Zu den offenen Forderungen"
            renderItem={(d) => (
              <>
                <span className="font-medium">{d.customer_name}</span>
                <span className="text-muted-foreground"> — {eur(d.open_amount)} · {d.level_label}</span>
              </>
            )}
          />
        )}
      </div>
    </div>
  );
}