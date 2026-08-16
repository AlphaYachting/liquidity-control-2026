import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check, Link2, Plus, Search } from 'lucide-react';

// Pflichtschritt vor der Freigabe: der Kunde wird ausdrücklich gewählt oder angelegt.
// Gültig ist er erst mit verknüpfter sevDesk-Kontakt-ID.
export default function ClientLinkStep({ deal, kunde, client, onClient }) {
  const [query, setQuery] = useState(kunde || '');
  const [clients, setClients] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const [linkMode, setLinkMode] = useState(false);
  const [manualHint, setManualHint] = useState(null);
  const [manualId, setManualId] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (!q) { setClients([]); setContacts([]); return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const all = await base44.entities.Client.list('-created_date', 500).catch(() => []);
      const hits = all.filter((c) => (c.name || '').toLowerCase().includes(q.toLowerCase())).slice(0, 10);
      const res = await base44.functions.invoke('fetchSevdeskContacts', { query: q }).catch(() => null);
      if (cancelled) return;
      setClients(hits);
      setContacts(res?.data?.contacts || []);
      setLoading(false);
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const run = async (key, fn) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e?.message || 'Unbekannter Fehler'); }
    setBusy('');
  };

  const clientFields = () => ({
    contact_person: deal?.contact_name || '',
    contact_email: deal?.contact_email || 'unbekannt@example.com',
    agb_version: 'offen',
  });

  const chooseClient = (c) => { onClient(c); setLinkMode(!c.sevdesk_contact_id); };

  // (a) bestehender Client, dem noch die sevDesk-Verknüpfung fehlt
  const linkContact = (contact) => run(`link-${contact.sevdesk_contact_id}`, async () => {
    const id = contact.sevdesk_contact_id;
    const updated = await base44.entities.Client.update(client.id, { sevdesk_contact_id: id });
    onClient({ ...client, ...updated, sevdesk_contact_id: id });
    setLinkMode(false);
  });

  // Ausgang nicht verfügbar: Kontakt-ID von Hand nachtragen
  const saveManualId = () => run('manual', async () => {
    const id = manualId.trim();
    if (!id) throw new Error('Kontakt-ID fehlt');
    const target = client || await base44.entities.Client.create({ name: query.trim(), ...clientFields() });
    const updated = await base44.entities.Client.update(target.id, { sevdesk_contact_id: id });
    onClient({ ...target, ...updated, sevdesk_contact_id: id });
    setManualHint(null);
    setLinkMode(false);
  });

  // (b) sevDesk-Kontakt ohne Client → Client anlegen und ID übernehmen
  const createFromContact = (contact) => run(`create-${contact.sevdesk_contact_id}`, async () => {
    const created = await base44.entities.Client.create({
      name: contact.name, ...clientFields(), sevdesk_contact_id: contact.sevdesk_contact_id,
    });
    onClient(created);
    setLinkMode(false);
  });

  // (c) weder Client noch sevDesk-Kontakt → beides neu anlegen
  const createBoth = () => run('new', async () => {
    const name = query.trim();
    if (!name) throw new Error('Kundenname fehlt');
    const res = await base44.functions.invoke('createSevdeskContact', {
      name, contact_email: deal?.contact_email || '',
    });
    const contactId = res?.data?.sevdesk_contact_id;
    if (!contactId) {
      setManualHint(res?.data?.error || 'sevDesk hat keine Kontakt-ID geliefert');
      return;
    }
    const created = await base44.entities.Client.create({ name, ...clientFields(), sevdesk_contact_id: contactId });
    onClient(created);
    setLinkMode(false);
  });

  const linkedClient = client?.sevdesk_contact_id ? client : null;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Kunde verknüpfen · Pflicht</p>
        <p className="text-xs text-muted-foreground">Bestehenden Kunden wählen, aus sevDesk übernehmen oder neu anlegen.</p>
      </div>

      {linkedClient && !linkMode ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-emerald-100 px-3 py-2">
          <span className="text-sm text-emerald-700 flex items-center gap-2">
            <Check className="w-4 h-4" /> {linkedClient.name} · sevDesk {linkedClient.sevdesk_contact_id}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { onClient(null); setLinkMode(false); }}>
            Ändern
          </Button>
        </div>
      ) : (
        <>
          {client && !client.sevdesk_contact_id && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              „{client.name}" ist noch nicht mit sevDesk verknüpft — passenden Kontakt unten wählen.
            </p>
          )}
          <div>
            <Label className="text-xs">Kundenname suchen</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 pl-8" placeholder="z. B. Timber-Moves" />
            </div>
          </div>

          {loading && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Kunden und sevDesk werden durchsucht…</p>}

          {!client && clients.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bestehende Kunden</p>
              {clients.map((c) => (
                <button key={c.id} onClick={() => chooseClient(c)}
                  className="w-full text-left text-sm px-3 py-2 rounded-md border hover:bg-accent flex items-center justify-between gap-2">
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {c.sevdesk_contact_id ? `sevDesk ${c.sevdesk_contact_id}` : 'ohne sevDesk'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {contacts.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">sevDesk-Kontakte</p>
              {contacts.map((k) => (
                <div key={k.sevdesk_contact_id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border">
                  <span className="text-sm truncate">{k.name}{k.customer_number ? ` · ${k.customer_number}` : ''}</span>
                  {client && !client.sevdesk_contact_id ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                      disabled={Boolean(busy)} onClick={() => linkContact(k)}>
                      <Link2 className="w-3.5 h-3.5" /> {busy === `link-${k.sevdesk_contact_id}` ? 'Verknüpft…' : 'Verknüpfen'}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                      disabled={Boolean(busy)} onClick={() => createFromContact(k)}>
                      <Plus className="w-3.5 h-3.5" /> {busy === `create-${k.sevdesk_contact_id}` ? 'Legt an…' : 'Als Kunde übernehmen'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && query.trim() && !client && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={Boolean(busy)} onClick={createBoth}>
              <Plus className="w-3.5 h-3.5" /> {busy === 'new' ? 'Wird angelegt…' : `„${query.trim()}" neu anlegen (Kunde + sevDesk)`}
            </Button>
          )}

          {manualHint && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
              <p className="text-xs text-amber-800">
                sevDesk hat den Kunden nicht angelegt ({manualHint}). Kunden in sevDesk anlegen und die
                Kontakt-ID hier eintragen — ohne verknüpfte ID bleibt die Freigabe gesperrt.
              </p>
              <div className="flex gap-2">
                <Input value={manualId} onChange={(e) => setManualId(e.target.value)} className="h-8 text-xs" placeholder="sevDesk Kontakt-ID" />
                <Button size="sm" className="h-8 text-xs shrink-0" disabled={Boolean(busy)} onClick={saveManualId}>
                  {busy === 'manual' ? 'Speichert…' : 'ID eintragen'}
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  );
}