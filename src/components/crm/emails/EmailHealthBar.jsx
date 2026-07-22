import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { emailApi } from '@/components/crm/emails/emailApi';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export default function EmailHealthBar() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['email-db-health'],
    queryFn: () => emailApi('health'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verbindung zur E-Mail-Datenbank wird geprüft…
      </div>
    );
  }
  if (isError || data?.status !== 'ok') {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive">
        <XCircle className="w-3.5 h-3.5" /> E-Mail-Datenbank nicht erreichbar{error?.message ? ` (${error.message})` : ''}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      <span className="font-medium text-foreground">Verbunden</span>
      <span>· {Number(data.nachrichten).toLocaleString('de-AT')} Mails</span>
      <span>· {Number(data.threads).toLocaleString('de-AT')} Konversationen</span>
      <span>· zuletzt aktualisiert {String(data.zuletzt_importiert || '').slice(0, 16)}</span>
    </div>
  );
}