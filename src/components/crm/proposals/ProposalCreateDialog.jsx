import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { SIGNERS } from '@/components/crm/proposals/proposalConfig';

export default function ProposalCreateDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [mode, setMode] = useState('full');
  const [sprint, setSprint] = useState(false);
  const [signedBy, setSignedBy] = useState(SIGNERS[0]);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    const proposal = await base44.entities.CrmProposal.create({
      title, customer_company: company, contact_person: contact,
      mode, sprint_mode: sprint, signed_by: signedBy, status: 'input',
    });
    setSaving(false);
    onOpenChange(false);
    navigate(`/crm/proposals/${proposal.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Neues visuelles Angebot</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Modus</Label>
            <Tabs value={mode} onValueChange={setMode} className="mt-1">
              <TabsList className="w-full">
                <TabsTrigger value="full" className="flex-1">Vollversion</TabsTrigger>
                <TabsTrigger value="short" className="flex-1">Kurzform</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-[11px] text-muted-foreground mt-1">
              Vollversion für Neukunden/Erstkontakt · Kurzform meist für Bestandskunden
            </p>
          </div>
          <div>
            <Label className="text-xs">Angebotsbezeichnung *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. Website-Relaunch Wieser Handwerk" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Firma</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Ansprechpartner</Label>
              <Input value={contact} onChange={e => setContact(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <Label className="text-xs">Signatur</Label>
              <Select value={signedBy} onValueChange={setSignedBy}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIGNERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch checked={sprint} onCheckedChange={setSprint} id="sprint" />
              <Label htmlFor="sprint" className="text-xs">Sprint (fester Liefertermin)</Label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleCreate} disabled={!title.trim() || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Anlegen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}