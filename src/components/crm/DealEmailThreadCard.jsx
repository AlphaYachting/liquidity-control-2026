import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, ExternalLink } from 'lucide-react';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';

// E-Mail-Verlauf des Deals — zeigt den Ursprungs-Thread aus der E-Mail-Datenbank
// und verlinkt in die E-Mail-Zentrale.
export default function DealEmailThreadCard({ deal }) {
  if (!deal.email_thread_id) return null;

  return (
    <div className="border rounded-xl bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" /> E-Mail-Verlauf
        </h3>
        <Link
          to={`/crm/emails?thread=${deal.email_thread_id}`}
          className="text-xs text-primary flex items-center gap-1 hover:underline"
        >
          In der E-Mail-Zentrale öffnen <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <EscalationThreadPreview threadId={deal.email_thread_id} limit={3} />
    </div>
  );
}