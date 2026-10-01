import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Inbox } from 'lucide-react';
import { emailApi } from '@/components/crm/emails/emailApi';
import EmailHealthBar from '@/components/crm/emails/EmailHealthBar';
import EmailIndexStatus from '@/components/crm/emails/EmailIndexStatus';
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
  const [truncated, setTruncated] = useState(false);

  // Die E-Mail-Zentrale ist Suche und Archiv. Was unbeantwortet ist, steht im Posteingang.
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
    load(filters);
    // Deep-Link aus dem Projektcockpit: ?thread=<id> öffnet die Konversation direkt
    const urlParams = new URLSearchParams(window.location.search);
    const threadParam = urlParams.get('thread');
    if (threadParam) openThread(threadParam);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Statuswechsel (erledigt / wieder öffnen) ohne Komplett-Reload:
  // Detailansicht und Liste werden lokal aktualisiert.
  const applyStatusChange = (threadId, newStatus) => {
    // Das Verlaufs-Verzeichnis (Quelle des Posteingangs) zieht das Backend beim
    // Speichern selbst nach — hier nur die Anzeige aktualisieren.
    setThread((prev) =>
      prev?.thread?.id === threadId ? { ...prev, thread: { ...prev.thread, status: newStatus } } : prev
    );
    setItems((prev) => {
      if (mode === 'search') return prev;
      return prev.map((t) => (t.id === threadId ? { ...t, status: newStatus } : t));
    });
  };

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
        <div className="flex items-center gap-2 flex-wrap">
          <EmailIndexStatus />
          <EmailHealthBar />
        </div>
      </div>


      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Inbox className="w-3.5 h-3.5" />
        Unbeantwortete Kundennachrichten stehen im{' '}
        <Link to="/crm/inbox" className="text-primary hover:underline font-medium">Posteingang</Link>.
        Hier: alle Konversationen durchsuchen, lesen und beantworten.
      </p>

      <EmailFilterBar filters={filters} onChange={setFilters} onApply={() => load()} loading={loadingList} showStatus />

      <div className="grid grid-cols-1 lg:grid-cols-[400px,1fr] gap-4 items-start">
        <div className="lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
          <EmailThreadList
            mode={mode}
            items={items}
            selectedId={selectedId}
            onSelect={openThread}
            loading={loadingList}
            error={listError}
            onStatusChanged={applyStatusChange}
          />
        </div>
        <EmailThreadDetail
          thread={thread}
          loading={loadingThread}
          onRefresh={() => { openThread(selectedId); load(); }}
          onStatusChanged={applyStatusChange}
        />
      </div>
    </div>
  );
}