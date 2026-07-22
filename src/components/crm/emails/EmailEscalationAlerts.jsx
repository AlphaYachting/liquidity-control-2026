import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertTriangle } from 'lucide-react';
import { useEmailEscalations } from '@/hooks/useEmailEscalations';
import { formatMailDate } from '@/components/crm/emails/emailConfig';

// Eskalierte E-Mail-Threads (letzte 60 Tage) als eigene Alert-Sektion.
export default function EmailEscalationAlerts() {
  const { data: threads = [], isLoading } = useEmailEscalations();
  if (isLoading || threads.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-red-600 uppercase tracking-wide flex items-center gap-1.5">
        <Mail className="w-3.5 h-3.5" /> E-Mail-Eskalationen ({threads.length})
      </p>
      {threads.map((t) => (
        <Link
          key={t.id}
          to="/crm/emails"
          className="border border-red-300 bg-red-100 text-red-800 rounded-xl p-4 flex items-start gap-4 hover:shadow-md transition-shadow"
        >
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{t.customer_normalized || 'Unbekannter Absender'}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500 text-white">E-Mail</span>
              <span className="text-xs text-current/70">{formatMailDate(t.last_message_at).slice(0, 10)}</span>
            </div>
            <p className="text-sm mt-1 font-medium truncate">{t.subject || '(kein Betreff)'}</p>
            {t.summary && <p className="text-sm mt-0.5 line-clamp-2">{t.summary}</p>}
          </div>
          <div className="text-xs font-medium flex-shrink-0">→ E-Mail-Zentrale</div>
        </Link>
      ))}
    </div>
  );
}