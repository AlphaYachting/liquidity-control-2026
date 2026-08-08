import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';

// E-Mail-Verlauf des Deals — zeigt den Ursprungs-Thread aus der E-Mail-Datenbank
// und verlinkt in die E-Mail-Zentrale.
export default function DealEmailThreadCard({ deal }) {
  if (!deal.email_thread_id) return null;

  return (
    <div className="space-y-3">
      <EscalationThreadPreview threadId={deal.email_thread_id} limit={3} />
      <Link
        to={`/crm/emails?thread=${deal.email_thread_id}`}
        className="text-xs text-primary flex items-center gap-1 hover:underline"
      >
        In der E-Mail-Zentrale öffnen <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}