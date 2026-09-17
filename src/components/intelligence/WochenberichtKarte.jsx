import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Box, BoxKopf } from '@/components/shared/Box';
import StatusEtikett from '@/components/shared/StatusEtikett';
import { markdownKomponenten } from '@/components/shared/markdownKomponenten';

const datum = (d) => (d ? new Date(d).toLocaleDateString('de-AT') : '—');
const eur = (v) => `€${Math.round(v || 0).toLocaleString('de-AT')}`;

const Zelle = ({ label, wert, hinweis, kritisch }) => (
  <div className="p-3.5 min-w-0 border-border [&:nth-child(n+3)]:border-t [&:nth-child(even)]:border-l">
    <p className="text-label uppercase text-muted-foreground truncate">{label}</p>
    <p className={cn('text-value tabular-nums', kritisch ? 'text-status-critical' : 'text-foreground')}>{wert}</p>
    {hinweis && <p className="text-meta text-muted-foreground truncate">{hinweis}</p>}
  </div>
);

// Zuletzt erzeugter Wochenbericht als Briefing — Kennzahlen oben, Text darunter.
export default function WochenberichtKarte({ report, onRefreshed }) {
  const [laeuft, setLaeuft] = useState(false);
  const [ganz, setGanz] = useState(false);

  const alter = report?.report_date
    ? Math.floor((Date.now() - new Date(report.report_date).getTime()) / 86400000)
    : null;
  const veraltet = alter === null || alter > 8;

  const kpi = (() => {
    try { return report?.kpi_json ? JSON.parse(report.kpi_json) : null; } catch { return null; }
  })();

  const neuBerechnen = async () => {
    setLaeuft(true);
    const res = await base44.functions.invoke('generateWeeklyIntelligenceReport', {});
    setLaeuft(false);
    if (res?.data?.error) { toast.error('Bericht konnte nicht erzeugt werden.'); return; }
    toast.success('Bericht neu berechnet.');
    onRefreshed?.();
  };

  return (
    <Box>
      <BoxKopf
        titel={report?.title || 'Wochenbericht'}
        hinweis={report ? `vom ${datum(report.report_date)}` : 'noch kein Bericht'}
        aktion={
          <>
            {veraltet && <StatusEtikett ton="attention">veraltet</StatusEtikett>}
            <Button
              variant="ghost" size="icon-sm" onClick={neuBerechnen} disabled={laeuft}
              aria-label="Bericht neu berechnen" title="Bericht neu berechnen"
            >
              <RefreshCw className={laeuft ? 'animate-spin' : ''} />
            </Button>
          </>
        }
      />

      {kpi && (
        <div className="grid grid-cols-2 border-b">
          <Zelle
            label="Eingänge nächste Woche"
            wert={eur(kpi.zahlungseingaenge_naechste_woche)}
            hinweis={`${kpi.zahlungseingaenge_anzahl || 0} Rechnungen`}
          />
          <Zelle label="Geplante Abrechnungen" wert={eur(kpi.geplante_abrechnungen_netto)} />
          <Zelle
            label="Quick-Win-Potenzial"
            wert={eur(kpi.quick_win_potenzial_netto)}
            hinweis={`${kpi.quick_wins || 0} Projekte`}
          />
          <Zelle
            label="Überfällig"
            wert={eur(kpi.ueberfaellig_summe)}
            kritisch={(kpi.ueberfaellig_summe || 0) > 0}
            hinweis={`${kpi.ueberfaellig_anzahl || 0} Rechnungen`}
          />
        </div>
      )}

      {report?.content_markdown && (
        <>
          <div className={cn('px-4 py-3 overflow-y-auto', !ganz && 'max-h-[560px]')}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownKomponenten}>
              {report.content_markdown}
            </ReactMarkdown>
          </div>
          <div className="px-4 pb-3">
            <Button variant="ghost" size="sm" onClick={() => setGanz((g) => !g)}>
              {ganz ? 'Einklappen' : 'Ganzen Bericht zeigen'}
            </Button>
          </div>
        </>
      )}
    </Box>
  );
}