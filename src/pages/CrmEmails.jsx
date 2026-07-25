import React, { useState, useEffect } from 'react';
import { Mail } from 'lucide-react';
import { emailApi } from '@/components/crm/emails/emailApi';
import EmailHealthBar from '@/components/crm/emails/EmailHealthBar';
import EmailFilterBar from '@/components/crm/emails/EmailFilterBar';
import EmailThreadList from '@/components/crm/emails/EmailThreadList';
import EmailThreadDetail from '@/components/crm/emails/EmailThreadDetail';

export default function CrmEmails() {
  const [filters, setFilters] = useState({ q: '', customer: '', status: 'all', days: '30', direction: 'all' });
  const [mode, setMode] = useState('threads');
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const load = async (f = filters) => {
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
    load();
    // Deep-Link aus dem Projektcockpit: ?thread=<id> öffnet die Konversation direkt
    const urlParams = new URLSearchParams(window.location.search);
    const threadParam = urlParams.get('thread');
    if (threadParam) openThread(threadParam);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      <EmailFilterBar filters={filters} onChange={setFilters} onApply={() => load()} loading={loadingList} />

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