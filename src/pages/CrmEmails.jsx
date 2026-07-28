import React, { useState, useEffect } from 'react';
import { Mail } from 'lucide-react';
import { emailApi } from '@/components/crm/emails/emailApi';
import EmailHealthBar from '@/components/crm/emails/EmailHealthBar';
import EmailFilterBar from '@/components/crm/emails/EmailFilterBar';
import EmailThreadList from '@/components/crm/emails/EmailThreadList';
import EmailThreadDetail from '@/components/crm/emails/EmailThreadDetail';
import EmailViewToggle from '@/components/crm/emails/EmailViewToggle';
import { waitingDaysSince } from '@/components/crm/emails/emailConfig';

// Triage-Sortierung: Reklamationen zuerst, dann Offen vor "Wartet auf Kunde", dann längste Wartezeit oben
const urgencySort = (a, b) => {
  const rek = (t) => (t.category === 'reklamation' ? 0 : 1);
  if (rek(a) !== rek(b)) return rek(a) - rek(b);
  const st = (t) => (t.status === 'offen' ? 0 : 1);
  if (st(a) !== st(b)) return st(a) - st(b);
  return (b._waiting_days || 0) - (a._waiting_days || 0);
};

export default function CrmEmails() {
  const [filters, setFilters] = useState({ q: '', customer: '', status: 'all', days: '30', direction: 'all' });
  const [view, setView] = useState('action');
  const [mode, setMode] = useState('threads');
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const load = async (f = filters, v = view) => {
    setLoadingList(true); setListError(null);
    try {
      if (f.q.trim()) {
        const params = { q: f.q.trim(), limit: 50 };
        if (f.customer.trim()) params.customer = f.customer.trim();
        if (f.direction !== 'all') params.direction = f.direction;
        if (f.days !== 'all') params.days = f.days;
        const data = await emailApi('search', { params });
        setMode('search');
        setItems(data.results || []);
      } else if (v === 'action') {
        // Triage: nur ausgewertete Kunden-Threads, die Handlung brauchen — System-/Rausch-Mails haben keinen Status und fallen automatisch raus
        const base = { limit: 100 };
        if (f.customer.trim()) base.customer = f.customer.trim();
        if (f.days !== 'all') base.days = f.days;
        const [open, waiting] = await Promise.all([
          emailApi('threads', { params: { ...base, status: 'offen' } }),
          emailApi('threads', { params: { ...base, status: 'wartet_auf_kunde' } }),
        ]);
        const seen = new Set();
        const merged = [...(open.results || []), ...(waiting.results || [])]
          .filter((t) => !seen.has(t.id) && seen.add(t.id))
          .map((t) => ({ ...t, _waiting_days: waitingDaysSince(t.last_message_at) }))
          .sort(urgencySort);
        setMode('threads');
        setItems(merged);
      } else {
        const params = { limit: 50, with_reply_state: 1 };
        if (f.customer.trim()) params.customer = f.customer.trim();
        if (f.status !== 'all') params.status = f.status;
        if (f.days !== 'all') params.days = f.days;
        const data = await emailApi('threads', { params });
        setMode('threads');
        setItems(data.results || []);
      }
    } catch (e) {
      setListError(e?.response?.data?.error || e?.message || 'Fehler beim Laden');
    }
    setLoadingList(false);
  };

  useEffect(() => {
    load(filters, view);
    // Deep-Link aus dem Projektcockpit: ?thread=<id> öffnet die Konversation direkt
    const urlParams = new URLSearchParams(window.location.search);
    const threadParam = urlParams.get('thread');
    if (threadParam) openThread(threadParam);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const openThread = async (threadId) => {
    if (!threadId) return;
    setSelectedId(threadId);
    setLoadingThread(true);
    setThread(null);
    try {
      const data = await emailApi('thread', { params: { id: threadId, msgs: 15, full: 1 } });
      setThread(data);
    } catch (e) {
      setThread({ error: e?.response?.data?.error || e?.message || 'Konversation konnte nicht geladen werden' });
    }
    setLoadingThread(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" /> E-Mail-Zentrale
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Zentrale Kundenkommunikation aus allen Firmenpostfächern — durchsuchen, lesen, auswerten.
          </p>
        </div>
        <EmailHealthBar />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EmailViewToggle
          view={view}
          onChange={setView}
          actionCount={view === 'action' && !loadingList ? items.filter((t) => t.status === 'offen').length : undefined}
        />
      </div>

      <EmailFilterBar filters={filters} onChange={setFilters} onApply={() => load()} loading={loadingList} showStatus={view !== 'action'} />

      <div className="grid grid-cols-1 lg:grid-cols-[400px,1fr] gap-4 items-start">
        <div className="lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
          <EmailThreadList
            mode={mode}
            items={items}
            selectedId={selectedId}
            onSelect={openThread}
            loading={loadingList}
            error={listError}
          />
        </div>
        <EmailThreadDetail
          thread={thread}
          loading={loadingThread}
          onRefresh={() => { openThread(selectedId); load(); }}
        />
      </div>
    </div>
  );
}