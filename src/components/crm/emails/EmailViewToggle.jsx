import React from 'react';
import { Inbox, Mails } from 'lucide-react';

// Umschalter zwischen Triage-Ansicht ("Braucht Antwort") und ungefilterter Gesamtliste.
export default function EmailViewToggle({ view, onChange, actionCount }) {
  const tabs = [
    { key: 'action', label: 'Braucht Antwort', icon: Inbox, count: actionCount },
    { key: 'all', label: 'Alle E-Mails', icon: Mails },
  ];
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === t.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <t.icon className="w-3.5 h-3.5" />
          {t.label}
          {t.key === 'action' && typeof t.count === 'number' && (
            <span className={`text-[10px] px-1.5 rounded-full ${t.count > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}