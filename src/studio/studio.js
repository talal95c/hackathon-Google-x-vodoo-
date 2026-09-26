import './studio.css';
import bnw from '../brand/packs/bnw.json';
import { DRAFT_KEY, validatePack } from '../brand/pack.js';

const $ = (id) => document.getElementById(id);
const WORLD_TEMPLATES = [
  (p) => ({ sky: '#fff4dc', skyTop: p.primary, cloud: '#ffffff', sun: p.accent, road: '#f4f1ea', edge: p.primary, dash: p.accent, text: p.primary }),
  (p) => ({ sky: '#46586a', skyTop: '#0b1b2a', cloud: '#607487', sun: p.alt, road: '#2d3136', edge: p.accent, dash: '#ffffff', text: '#ffffff' }),
  (p) => ({ sky: '#fff1c2', skyTop: p.accent, cloud: '#ffffff', sun: '#ffffff', road: '#ffffff', edge: p.primary, dash: p.alt, text: p.primary }),
  (p) => ({ sky: '#cfe3ee', skyTop: p.primary, cloud: '#ffffff', sun: p.accent, road: '#e9eef2', edge: p.alt, dash: p.primary, text: p.primary }),
  (p) => ({ sky: '#ffd9c2', skyTop: p.alt, cloud: '#ffeee4', sun: p.accent, road: '#fff8ef', edge: p.primary, dash: p.accent, text: p.primary }),
];
const slug = (s) => (s || 'brand').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'brand';
const siteHost = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : undefined);

function loadDraft() {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY)); if (!validatePack(d).length) return d; } catch { /* none */ }
  return structuredClone(bnw);
}

let pack = loadDraft();
let session = JSON.parse(localStorage.getItem('dino-brand-session') ?? 'null');
let reloadTimer = 0;
const studioToken = new URLSearchParams(location.search).get('token') ?? localStorage.getItem('dino-studio-token');
if (studioToken) localStorage.setItem('dino-studio-token', studioToken);

function save({ reload = true } = {}) {
  // Each website gets its own id and save slot; edits to the same website keep it.
  const host = siteHost(pack.url);
  if (host && pack.site !== host) {
    pack.site = host;
    pack.id = host === siteHost(bnw.url) ? bnw.id : slug(host);
  }
  pack.id = slug(pack.id || pack.name);
  localStorage.setItem(DRAFT_KEY, JSON.stringify(pack));
  if (reload) { clearTimeout(reloadTimer); reloadTimer = setTimeout(reloadPreview, 500); }
}
function reloadPreview() { $('preview').src = `brand.html?pack=draft&t=${Date.now()}`; }
const status = (text, link) => {
  $('status').replaceChildren();
  if (link) { const a = document.createElement('a'); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Devin session'; $('status').append(a, ': '); }
  $('status').append(text);
};
const addChat = (text, me = false) => { const p = document.createElement('p'); p.textContent = text; if (me) p.className = 'me'; $('chat').append(p); p.scrollIntoView({ block: 'nearest' }); };

function bindText(id, get, set) {
  const el = $(id);
  el.value = get() ?? '';
  el.oninput = () => { set(el.value); save(); };
}

function recolorWorlds() {
  const p = pack.palette;
  pack.worlds = WORLD_TEMPLATES.map((t, i) => ({ ...(pack.worlds?.[i] ?? {}), palette: t(p) }));
}

function render() {
  pack.palette ??= { primary: '#143852', accent: '#ffcc40', alt: '#cf2e2e', light: '#ffffff' };
  pack.copy ??= {};
  bindText('f-url', () => pack.url, (v) => { pack.url = v; });
  bindText('f-name', () => pack.name, (v) => { pack.name = v; });
  bindText('f-tagline', () => pack.tagline, (v) => { pack.tagline = v; });
  bindText('f-title', () => pack.copy.title, (v) => { pack.copy.title = v; });
  bindText('f-hero', () => pack.copy.hero, (v) => { pack.copy.hero = v; });
  bindText('f-cta', () => pack.copy.cta, (v) => { pack.copy.cta = v; });
  $('f-kit').value = pack.kit ?? 'generic';
  $('f-kit').onchange = () => { pack.kit = $('f-kit').value; save(); };
  for (const k of ['primary', 'accent', 'alt', 'light']) {
    const el = $(`c-${k}`);
    el.value = pack.palette[k] ?? '#000000';
    el.oninput = () => { pack.palette[k] = el.value; pack.skin = { ...pack.skin, color: pack.palette.primary, eye: pack.palette.accent }; recolorWorlds(); save(); };
  }
  document.documentElement.style.setProperty('--logo-bg', pack.palette.primary);
  $('logoPreview').src = pack.logo ?? '';

  pack.ads = Array.from({ length: 6 }, (_, i) => pack.ads?.[i] ?? { text: '', sub: '' });
  $('ads').innerHTML = '';
  pack.ads.forEach((ad, i) => {
    const row = document.createElement('div'); row.className = 'pair';
    for (const key of ['text', 'sub']) {
      const input = document.createElement('input');
      input.placeholder = key === 'text' ? `Ad ${i + 1} headline` : 'Subline';
      input.value = ad[key] ?? '';
      input.oninput = () => { ad[key] = input.value; save(); };
      row.append(input);
    }
    $('ads').append(row);
  });

  pack.worlds = Array.from({ length: 5 }, (_, i) => pack.worlds?.[i] ?? { name: `WORLD ${i + 1}`, subtitle: '' });
  $('worlds').innerHTML = '';
  pack.worlds.forEach((wld, i) => {
    const row = document.createElement('div'); row.className = 'pair';
    for (const key of ['name', 'subtitle']) {
      const input = document.createElement('input');
      input.placeholder = key === 'name' ? `World ${i + 1}` : 'Subtitle';
      input.value = wld[key] ?? '';
      input.oninput = () => { wld[key] = input.value; save(); };
      row.append(input);
    }
    $('worlds').append(row);
  });
  $('openGame').href = 'brand.html?pack=draft';
}

function merge(update) {
  if (!isObject(update)) return;
  const notes = text(update.notes);
  const rest = {};
  for (const key of ['name', 'tagline', 'logo', 'kit']) if (text(update[key])?.trim()) rest[key] = update[key];
  for (const key of ['palette', 'copy', 'skin', 'music']) if (isObject(update[key])) rest[key] = update[key];
  if (Array.isArray(update.ads)) rest.ads = update.ads.filter(isObject);
  const worlds = Array.isArray(update.worlds)
    ? update.worlds.filter(isObject).map((wld, i) => ({ ...(pack.worlds?.[i] ?? {}), ...wld }))
    : pack.worlds;
  const logo = pack.logo;
  pack = { ...pack, ...rest, logo, palette: { ...pack.palette, ...rest.palette }, copy: { ...pack.copy, ...rest.copy }, skin: { ...pack.skin, ...rest.skin }, music: { ...pack.music, ...rest.music }, worlds };
  if (rest.logo && rest.logo !== logo) adoptLogo(rest.logo);
  if (rest.palette) recolorWorlds();
  if (notes) addChat(`Devin: ${notes}`);
  render(); save();
}

async function api(path, body) {
  const headers = { 'Content-Type': 'application/json', ...(studioToken && { 'X-Studio-Token': studioToken }) };
  const res = await fetch(`/api/studio/${path}`, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
  const out = await res.json().catch(() => ({ error: `studio server unavailable (${res.status})` }));
  if (!res.ok) throw new Error(out.error ?? res.statusText);
  return out;
}

function showSwatches(colors) {
  $('swatches').innerHTML = '';
  for (const c of colors ?? []) {
    const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.title = `${c}: click to use as the accent, shift+click to use as the primary`;
    b.onclick = (e) => { pack.palette[e.shiftKey ? 'primary' : 'accent'] = c; pack.skin = { ...pack.skin, color: pack.palette.primary, eye: pack.palette.accent }; recolorWorlds(); render(); save(); };
    $('swatches').append(b);
  }
}

// Stores a remote logo as a downscaled data URL so the game can draw it on canvas textures.
async function adoptLogo(url) {
  if (!url || url.startsWith('data:')) return;
  const owner = pack, previousLogo = owner.logo;
  try {
    const { dataUrl } = await api('image', { url });
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = dataUrl; });
    const s = Math.min(1, 480 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    if (pack !== owner || pack.logo !== previousLogo) return;
    pack.logo = c.toDataURL('image/png');
    render(); save();
  } catch { /* keep the current logo */ }
}

$('scan').onclick = async () => {
  if (!pack.url) return status('Enter your website first.');
  $('scan').disabled = true; status('Scanning website…');
  try {
    const s = await api('scan', { url: pack.url });
    if (s.name && (!pack.name || pack.name === bnw.name)) pack.name = s.name;
    if (s.tagline) pack.tagline = s.tagline.slice(0, 80);
    if (s.logo) await adoptLogo(s.logo);
    if (s.colors?.[0]) { pack.palette.primary = s.colors[0]; pack.palette.accent = s.colors[1] ?? pack.palette.accent; pack.palette.alt = s.colors[2] ?? pack.palette.alt; pack.skin = { ...pack.skin, color: pack.palette.primary, eye: pack.palette.accent }; recolorWorlds(); }
    showSwatches(s.colors);
    render(); save();
    status(`Found ${s.colors?.length ?? 0} brand colors${s.logo ? ' and a logo' : ''}. For products, copy and worlds, use "Analyze with Devin".`);
  } catch (e) { status(`Scan failed: ${e.message}`); }
  $('scan').disabled = false;
};

let pollTimer = 0, lastPack = '';
async function poll() {
  clearTimeout(pollTimer);
  if (!session) return;
  try {
    const id = session.id;
    const s = await api(`session/${id}`);
    if (session?.id !== id) return;
    const key = JSON.stringify(s.pack ?? null);
    if (s.pack && key !== lastPack) { lastPack = key; merge(s.pack); }
    const idle = ['exit', 'error', 'suspended'].includes(s.status) || ['waiting_for_user', 'finished'].includes(s.status_detail);
    status(`${s.status_detail ?? s.status}${s.acus ? ` · ${s.acus.toFixed(2)} ACU` : ''}${s.pack ? ' · pack applied' : ' · working…'}`, /^https:\/\//.test(s.url ?? '') ? s.url : undefined);
    if (idle && s.pack && !session.pending) return;
    if (s.pack && key !== session.seen) session.pending = false;
  } catch (e) { status(`Devin: ${e.message}`); return; }
  pollTimer = setTimeout(poll, 8000);
}

$('analyze').onclick = async () => {
  if (!pack.url) return status('Enter your website first.');
  $('analyze').disabled = true; status('Starting a Devin session (up to 3 ACUs)…');
  try {
    const s = await api('analyze', { url: pack.url, name: pack.name, kit: $('f-kit').value });
    session = { id: s.session_id, url: s.url };
    localStorage.setItem('dino-brand-session', JSON.stringify(session));
    lastPack = '';
    poll();
  } catch (e) { status(`Devin: ${e.message}`); }
  $('analyze').disabled = false;
};

$('chatSend').onclick = async () => {
  const text = $('chatInput').value.trim();
  if (!text) return;
  if (!session) return status('Run "Analyze with Devin" first to open a studio session.');
  addChat(text, true); $('chatInput').value = '';
  try {
    await api(`session/${session.id}/message`, { text, pack: { ...pack, logo: pack.logo?.startsWith('data:') ? '(uploaded file)' : pack.logo } });
    session.pending = true; session.seen = lastPack;
    poll();
  } catch (e) { addChat(`Error: ${e.message}`); }
};

$('f-logo').onchange = () => {
  const file = $('f-logo').files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 480 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    pack.logo = c.toDataURL('image/png');
    URL.revokeObjectURL(img.src);
    render(); save();
  };
  img.src = URL.createObjectURL(file);
};
$('logoClear').onclick = () => { delete pack.logo; render(); save(); };

$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
  a.download = `${pack.id}.json`; a.click();
};
$('reset').onclick = () => { pack = structuredClone(bnw); session = null; localStorage.removeItem('dino-brand-session'); $('chat').innerHTML = ''; render(); save(); };

render();
save({ reload: false });
reloadPreview();
if (session) poll();
