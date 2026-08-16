// Bundles fassen Phasen-Module zu EINEM Katalog-Produkt zusammen (bundle_key).
// Module ohne bundle_key verhalten sich unverändert als Einzelmodul.
export const bundleLabel = (key) =>
  String(key || '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export function splitModules(modules = []) {
  const bundleMap = new Map();
  const singles = [];

  modules.forEach((m) => {
    if (m.bundle_key) {
      const list = bundleMap.get(m.bundle_key) || [];
      list.push(m);
      bundleMap.set(m.bundle_key, list);
    } else {
      singles.push(m);
    }
  });

  const bundles = [...bundleMap.entries()].map(([key, list]) => ({
    key,
    label: bundleLabel(key),
    modules: [...list].sort((a, b) => (Number(a.bundle_order) || 0) - (Number(b.bundle_order) || 0)),
  }));

  return { bundles, singles };
}