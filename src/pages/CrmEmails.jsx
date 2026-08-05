import React, { useState, useEffect } from 'react';
import { Mail } from 'lucide-react';
import { emailApi } from '@/components/crm/emails/emailApi';
import EmailHealthBar from '@/components/crm/emails/EmailHealthBar';
import EmailIndexStatus from '@/components/crm/emails/EmailIndexStatus';
import EmailFilterBar from '@/components/crm/emails/EmailFilterBar';
import EmailThreadList from '@/components/crm/emails/EmailThreadList';
import EmailThreadDetail from '@/components/crm/emails/EmailThreadDetail';
import EmailViewToggle from '@/components/crm/emails/EmailViewToggle';
import { buildTriageList } from '@/components/crm/emails/emailTriage';
import { loadWorkQueueThreads } from '@/components/crm/emails/emailWorkQueueSource';

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
  const [truncated, setTruncated] = useState(false);

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
        // Arbeitsliste aus dem eigenen Verlaufs-Index — vollständig, unabhängig
        // vom 100er-Fenster der E-Mail-Datenbank.
        let rows = await loadWorkQueueThreads(f.days);
        if (f.customer.trim()) {
          const needle = f.customer.trim().toLowerCase();
          rows = rows.filter((t) => `${t.customer || ''} ${t.last_from || ''}`.toLowerCase().includes(needle));
        }
        setMode('threads');
        setTruncated(false);
        setItems(buildTriageList(rows));
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

  // Statuswechsel (erledigt / wieder öffnen) ohne Komplett-Reload:
  // Detailansicht und Liste werden lokal aktualisiert.
  const applyStatusChange = (threadId, newStatus) => {
    setThread((prev) =>
      prev?.thread?.id === threadId ? { ...prev, thread: { ...prev.thread, status: newStatus } } : prev
    );
    setItems((prev) => {
      if (mode === 'search') return prev;
      // Arbeitsliste "Braucht Antwort": erledigte Threads verschwinden sofort
      if (view === 'action' && newStatus !== 'offen') return prev.filter((t) => t.id !== threadId);
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


      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EmailViewToggle
          view={view}
          onChange={setView}
          actionCount={view === 'action' && !loadingList ? items.length : undefined}
        />
        {view === 'action' && (
          <p className="text-[11px] text-muted-foreground max-w-xl">
            Kriterien: letzte Nachricht ist <strong>eingehend</strong>, von einem <strong>externen Absender</strong>, und der
            Verlauf ist als Geschäftskonversation belegt (wir haben schon geantwortet, es gibt mehrere Nachrichten, oder Kunde/Kategorie
            ist zugeordnet). Spam, Newsletter und System-Mails erfüllen das nicht. Sobald geantwortet oder ein Lead angelegt wurde, verschwindet der Thread.
            Reihenfolge: Reklamationen zuerst, danach längste Wartezeit.
          </p>
        )}
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
            onStatusChanged={applyStatusChange}
          />
          {view === 'action' && truncated && !loadingList && (
            <p className="text-[11px] text-muted-foreground mt-2 px-1">Es werden die 300 jüngsten offenen Konversationen angezeigt.</p>
          )}
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