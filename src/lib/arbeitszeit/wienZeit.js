// Uhrzeiten immer in Wiener Zeit — dieselbe Rechnung wie base44/shared/arbeitszeitKern.js,
// damit Browser in anderen Zeitzonen und Tage der Zeitumstellung richtig rechnen.
const TZ = 'Europe/Vienna';
const zwei = (n) => String(n).padStart(2, '0');
const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function teile(zeit) {
  const t = {};
  fmt.formatToParts(zeit instanceof Date ? zeit : new Date(zeit)).forEach((p) => { if (p.type !== 'literal') t[p.type] = Number(p.value); });
  return t;
}

export const wienTag = (zeit = new Date()) => { const t = teile(zeit); return `${t.year}-${zwei(t.month)}-${zwei(t.day)}`; };
export const wienUhr = (zeit) => { if (!zeit) return ''; const t = teile(zeit); return `${zwei(t.hour)}:${zwei(t.minute)}`; };

// „HH:MM“ an einem Wiener Tag → ISO-Zeitpunkt
export function wienIso(tag, uhr) {
  const [y, m, d] = tag.split('-').map(Number);
  const [h, mi] = String(uhr).split(':').map(Number);
  const wunsch = Date.UTC(y, m - 1, d, h, mi || 0, 0);
  let k = wunsch;
  for (let i = 0; i < 3; i += 1) {
    const t = teile(new Date(k));
    const diff = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second) - wunsch;
    if (diff === 0) break;
    k -= diff;
  }
  return new Date(k).toISOString();
}

export const WOCHENTAG = { mo: 'Mo', di: 'Di', mi: 'Mi', do: 'Do', fr: 'Fr', sa: 'Sa', so: 'So' };
export const tagKurz = (tag, wt) => `${WOCHENTAG[wt] || ''} ${tag.slice(8, 10)}.${tag.slice(5, 7)}.`;

export const dauer = (min) => {
  if (min === null || min === undefined) return '—';
  const m = Math.round(Number(min) || 0);
  const a = Math.abs(m);
  return `${m < 0 ? '−' : ''}${Math.floor(a / 60)}:${zwei(a % 60)}`;
};
export const saldo = (min) => (min === null || min === undefined ? '—' : `${min > 0 ? '+' : ''}${dauer(min)}`);

export const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const monatName = (m) => `${MONATE[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const monatPlus = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}`;
};
