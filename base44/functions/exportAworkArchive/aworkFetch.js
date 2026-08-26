// Rohabrufe gegen die awork-API — schonend, mit Wiederholungen und Fehlerprotokoll.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeAwork(apiBase, apiKey, fehler) {
  const basis = `${apiBase.replace(/\/$/, '')}/api/v1`;

  // Ein Abruf mit bis zu fünf Versuchen. Bei 429 verdoppelt sich die Pause.
  async function hole(pfad) {
    let pause = 200;
    for (let versuch = 1; versuch <= 5; versuch++) {
      const resp = await fetch(`${basis}${pfad}`, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
      if (resp.ok) {
        const data = await resp.json();
        return Array.isArray(data) ? data : (data.data || []);
      }
      const text = await resp.text().catch(() => '');
      if (resp.status === 429 || resp.status >= 500) {
        pause = pause * 2;
        await sleep(pause);
        continue;
      }
      fehler.push({ pfad, status: resp.status, meldung: text.slice(0, 200) });
      return null;
    }
    fehler.push({ pfad, status: 429, meldung: 'nach fünf Versuchen aufgegeben' });
    return null;
  }

  // Seitenweise bis eine Seite weniger als pageSize liefert. maxSeiten begrenzt,
  // damit ein zu grober Filter auffällt statt still abzubrechen.
  async function holeSeitenweise(pfad, { pageSize = 500, maxSeiten = 20 } = {}) {
    const alle = [];
    let seite = 1;
    let limitErreicht = false;
    while (seite <= maxSeiten) {
      const trenner = pfad.includes('?') ? '&' : '?';
      const rows = await hole(`${pfad}${trenner}page=${seite}&pageSize=${pageSize}`);
      if (rows === null) break;
      alle.push(...rows);
      if (rows.length < pageSize) break;
      if (seite === maxSeiten) limitErreicht = true;
      seite++;
      await sleep(200);
    }
    return { rows: alle, limitErreicht };
  }

  return { hole, holeSeitenweise };
}

export { sleep };