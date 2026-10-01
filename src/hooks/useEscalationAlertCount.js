import { useEmailEscalations } from '@/hooks/useEmailEscalations';
import { useCrmEscalationCases, isCaseVisible } from '@/hooks/useCrmEscalationCases';

// Zähler und Liste müssen dasselbe zeigen: erledigte und zurückgestellte
// Eskalations-Vorgänge werden auch im Zähler nicht mitgezählt.
export function useEscalationAlertCount({ enabled = true } = {}) {
  const { data: threads = [] } = useEmailEscalations(60, { enabled });
  const { data: cases = [] } = useCrmEscalationCases({ enabled });
  const caseByThread = new Map(cases.map((c) => [String(c.thread_id), c]));
  return threads.filter((t) => isCaseVisible(caseByThread.get(String(t.id)))).length;
}