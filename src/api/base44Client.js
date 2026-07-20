import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { withAuditLogging } from './auditWrapper';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
const rawClient = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Alle Entity-Mutationen werden automatisch im AuditLog dem Benutzer-Login zugeordnet
export const base44 = withAuditLogging(rawClient);