// Cache local des mondes générés (par site), images réduites en JPEG 256 px pour tenir
// dans le stockage du navigateur. + mondes pré-générés livrés avec le jeu (public/sites/).
const PREFIX = 'dino-site:';
const INDEX = 'dino-sites';

export async function shrink(dataURL, size = 256, quality = 0.8) {
  if (typeof document === 'undefined' || !dataURL) return dataURL;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataURL; });
  const c = document.createElement('canvas');
  const k = Math.min(1, size / Math.max(img.width, img.height));
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

const readIndex = () => { try { return JSON.parse(localStorage.getItem(INDEX)) || []; } catch { return []; } };

export function listCached() { return readIndex(); }

export function loadCached(host) {
  try { return JSON.parse(localStorage.getItem(PREFIX + host)); } catch { return null; }
}

export function saveCached(spec) {
  const index = readIndex().filter((h) => h !== spec.host);
  index.unshift(spec.host);
  const write = () => {
    localStorage.setItem(PREFIX + spec.host, JSON.stringify(spec));
    localStorage.setItem(INDEX, JSON.stringify(index));
  };
  try { write(); } catch {
    // stockage plein : on oublie les plus anciens
    while (index.length > 1) { localStorage.removeItem(PREFIX + index.pop()); try { write(); return; } catch { /* encore */ } }
  }
}

// Mondes livrés avec le jeu (générés par scripts/generate-sites.mjs)
export async function loadBuiltinIndex() {
  try { return await (await fetch('sites/index.json')).json(); } catch { return []; }
}
export async function loadBuiltin(host) {
  try { return await (await fetch(`sites/${host}.json`)).json(); } catch { return null; }
}
