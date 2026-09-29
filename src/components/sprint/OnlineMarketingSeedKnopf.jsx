import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Admin-Knopf: Online-Marketing-Module und -Vorlagen einspielen (wiederholbar).
export default function OnlineMarketingSeedKnopf() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [laeuft, setLaeuft] = useState(false);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  if (me?.role !== 'admin') return null;

  const start = async () => {
    setLaeuft(true);
    const res = await base44.functions.invoke('seedOnlineMarketingModule', {});
    setLaeuft(false);
    toast({ title: `${res.data.module} Module, ${res.data.vorlagen} Vorlagen angelegt` });
    qc.invalidateQueries({ queryKey: ['moduleTemplates'] });
    qc.invalidateQueries({ queryKey: ['ticketTemplates'] });
  };

  return (
    <Button variant="outline" size="sm" disabled={laeuft} onClick={start}>
      {laeuft && <Loader2 className="w-4 h-4 animate-spin" />} Online-Marketing-Vorlagen einspielen
    </Button>
  );
}