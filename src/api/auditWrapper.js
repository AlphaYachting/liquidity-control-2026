// Transparente Audit-Protokollierung: fängt alle Entity-Mutationen ab
// und schreibt einen AuditLog-Eintrag mit dem Login (E-Mail) des Benutzers.
// Kein Einfluss auf bestehende Aufrufe — Ergebnisse werden unverändert durchgereicht.

const MUTATION_ACTIONS = {
  create: 'create',
  bulkCreate: 'create',
  update: 'update',
  bulkUpdate: 'update',
  updateMany: 'update',
  delete: 'delete',
  deleteMany: 'delete',
};

const truncate = (value) => {
  try {
    const s = JSON.stringify(value);
    return s && s.length > 2000 ? s.slice(0, 2000) + '…' : s;
  } catch {
    return undefined;
  }
};

export function withAuditLogging(client) {
  let emailPromise = null;
  const getEmail = () => {
    if (!emailPromise) {
      emailPromise = client.auth.me()
        .then((u) => u?.email || 'unbekannt')
        .catch(() => 'unbekannt');
    }
    return emailPromise;
  };

  const writeLog = async (entry) => {
    const user_email = await getEmail();
    await client.entities.AuditLog.create({ ...entry, user_email });
  };

  const buildEntry = (method, args, result, entityName) => {
    const entry = { action: MUTATION_ACTIONS[method], entity_type: entityName };
    if (method === 'create') {
      entry.entity_id = result?.id;
      entry.new_value = truncate(args[0]);
    } else if (method === 'update') {
      entry.entity_id = args[0];
      entry.new_value = truncate(args[1]);
    } else if (method === 'delete') {
      entry.entity_id = args[0];
    } else if (method === 'bulkCreate') {
      entry.details = `${args[0]?.length || 0} Datensätze erstellt`;
    } else if (method === 'bulkUpdate') {
      entry.details = `${args[0]?.length || 0} Datensätze aktualisiert`;
      entry.new_value = truncate(args[0]?.map((r) => r.id));
    } else if (method === 'updateMany') {
      entry.details = 'Sammel-Update';
      entry.old_value = truncate(args[0]);
      entry.new_value = truncate(args[1]);
    } else if (method === 'deleteMany') {
      entry.details = 'Sammel-Löschung';
      entry.old_value = truncate(args[0]);
    }
    return entry;
  };

  const wrapEntity = (entity, entityName) => new Proxy(entity, {
    get(target, prop) {
      const orig = target[prop];
      if (!MUTATION_ACTIONS[prop] || typeof orig !== 'function') return orig;
      return async (...args) => {
        const result = await orig.apply(target, args);
        writeLog(buildEntry(prop, args, result, entityName)).catch(() => {});
        return result;
      };
    },
  });

  const wrappedEntities = new Proxy(client.entities, {
    get(target, prop) {
      const entity = target[prop];
      if (typeof prop !== 'string' || prop === 'AuditLog' || !entity) return entity;
      if (typeof entity !== 'object' && typeof entity !== 'function') return entity;
      return wrapEntity(entity, prop);
    },
  });

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'entities') return wrappedEntities;
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}