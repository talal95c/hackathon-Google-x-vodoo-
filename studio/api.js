// Brand Studio API (Vite dev/preview middleware). The Devin API key never leaves the server.
//   POST /api/studio/scan      { url }                -> quick brand hints scraped from the website
//   POST /api/studio/analyze   { url, name, kit }     -> starts a Devin v3 session returning a brand pack
//   GET  /api/studio/session/:id                      -> { status, status_detail, acus, url, pack }
//   POST /api/studio/session/:id/message { text, pack } -> asks the same session for a revised pack
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

const API = 'https://api.devin.ai/v3';

export const PACK_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' }, tagline: { type: 'string' }, logo: { type: 'string' },
    kit: { type: 'string', enum: ['burger', 'generic'] },
    palette: { type: 'object', properties: { primary: { type: 'string' }, accent: { type: 'string' }, alt: { type: 'string' }, light: { type: 'string' } } },
    copy: { type: 'object', properties: { title: { type: 'string' }, hero: { type: 'string' }, detail: { type: 'string' }, cta: { type: 'string' } } },
    worlds: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, subtitle: { type: 'string' } } } },
    ads: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, sub: { type: 'string' } } } },
    skin: { type: 'object', properties: { name: { type: 'string' }, color: { type: 'string' }, eye: { type: 'string' } } },
    music: { type: 'object', properties: { name: { type: 'string' }, core: { type: 'string' }, bpm: { type: 'number' }, levels: { type: 'array', items: { type: 'string' } } } },
    notes: { type: 'string' },
  },
};

const PACK_RULES = 'Fields: name; tagline; logo (absolute image URL of the logo); kit ("burger" for burger/fast-food places, else "generic"); '
  + 'palette hex colors {primary (dark brand color), accent, alt, light}; copy {title as "WORD|WORD." (two short uppercase lines split by |), hero (two short lines split by |), detail (two lines split by |), cta (call-to-action button text)}; '
  + 'exactly 5 worlds {name (short uppercase), subtitle}; 6 ads {text (short uppercase product/offer), sub}; skin {name, color, eye}; music {name, core (comma-separated Lyria style tags), bpm 80-140, levels (4 escalating tag strings)}; notes (anything the owner should know). '
  + 'Use the brand\'s own language for copy. Only use products/claims visible on the website.';

const decode = (s) => s.replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));

export function scanHtml(html, url) {
  const metas = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = (n) => tag.match(new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find((v) => v !== undefined);
    const key = (attr('property') ?? attr('name'))?.toLowerCase(), content = attr('content');
    if (key && content !== undefined && !(key in metas)) metas[key] = content;
  }
  const meta = (name) => metas[name];
  const abs = (src) => { if (!src) return undefined; try { return new URL(src, url).href; } catch { return undefined; } };
  const counts = {};
  for (const m of html.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const c = `#${m[1].toLowerCase()}`;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    if (Math.max(r, g, b) - Math.min(r, g, b) < 24) continue; // greys/black/white
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const colors = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  const imgSrc = (tag) => tag?.match(/\bdata-src=["']([^"']+)/i)?.[1] ?? tag?.match(/\bsrc=["'](?!data:)([^"']+)/i)?.[1];
  const header = html.match(/<header[\s\S]*?<\/header>/i)?.[0] ?? '';
  const logo = imgSrc(html.match(/<img[^>]*logo[^>]*>/i)?.[0]) ?? imgSrc(header.match(/<img[^>]*>/i)?.[0]);
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  return {
    name: decode(meta('og:site_name') ?? title.split(/[|–-]/).pop()?.trim() ?? title),
    tagline: decode(meta('og:description') ?? meta('description') ?? ''),
    logo: abs(logo ?? meta('og:image')),
    image: abs(meta('og:image')),
    colors,
  };
}

async function devin(path, init = {}) {
  const key = process.env.DEVIN_API_V3_KEY ?? process.env.DEVIN_API_KEY;
  if (!key) throw Object.assign(new Error('DEVIN_API_V3_KEY is not set on the studio server'), { status: 503 });
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.detail ?? `Devin API ${res.status}`), { status: res.status });
  return body;
}

let orgId = process.env.DEVIN_ORG_ID;
const org = async () => (orgId ??= (await devin('/self')).org_id);

const readJson = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 2e6) reject(Object.assign(new Error('body too large'), { status: 413 })); });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); } });
});

const fail = (status, message) => Object.assign(new Error(message), { status });

const httpUrl = (u) => {
  let url;
  try { url = new URL(u); } catch { throw fail(400, 'invalid url'); }
  if (!/^https?:$/.test(url.protocol)) throw fail(400, 'url must be http(s)');
  return url.href;
};

export const privateIp = (ip) => {
  const mapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  const v4 = mapped
    ? `${parseInt(mapped[1], 16) >> 8}.${parseInt(mapped[1], 16) & 255}.${parseInt(mapped[2], 16) >> 8}.${parseInt(mapped[2], 16) & 255}`
    : ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89abcdef]/.test(v6) || v6.startsWith('ff');
};

// Fetches a public website only: every hop (including redirects) uses its validated address.
async function fetchPublic(u, hops = 4) {
  const url = new URL(httpUrl(u));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw fail(400, 'host not found');
  if (addrs.some((a) => privateIp(a.address))) throw fail(400, 'only public websites can be scanned');
  const address = addrs[0];
  const res = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 DinoStudio' },
      lookup: (_host, _options, callback) => callback(null, address.address, address.family),
      timeout: 15000,
    }, (response) => resolve(new Response(
      [204, 205, 304].includes(response.statusCode) ? null : Readable.toWeb(response),
      { status: response.statusCode, headers: response.headers },
    )));
    request.on('timeout', () => request.destroy(new Error('remote request timed out')));
    request.on('error', reject);
  });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    if (!hops) throw fail(400, 'too many redirects');
    await res.body?.cancel();
    return fetchPublic(new URL(res.headers.get('location'), url).href, hops - 1);
  }
  return { res, url: url.href };
}

export async function readLimited(res, limit) {
  if (Number(res.headers.get('content-length')) > limit) {
    await res.body?.cancel();
    throw fail(413, 'remote response too large');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.byteLength;
    if (size > limit) throw fail(413, 'remote response too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

// Devin calls spend the server's credits: allowed from this machine, or remotely with STUDIO_TOKEN.
function authorize(req) {
  const token = process.env.STUDIO_TOKEN;
  if (token) { if (req.headers['x-studio-token'] !== token) throw fail(401, 'studio token required'); return; }
  const ip = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) throw fail(403, 'set STUDIO_TOKEN on the server to use Devin from other machines');
}

async function handle(req) {
  const path = req.url.split('?')[0];
  if (req.method === 'POST' && path === '/api/studio/scan') {
    const { res, url } = await fetchPublic((await readJson(req)).url);
    return scanHtml((await readLimited(res, 3e6)).toString('utf8'), url);
  }
  if (req.method === 'POST' && path === '/api/studio/image') {
    // Remote logos are proxied so the studio can store them as data URLs (canvas textures need same-origin pixels).
    const { res } = await fetchPublic((await readJson(req)).url);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) throw Object.assign(new Error('not an image'), { status: 422 });
    const buf = await readLimited(res, 4e6);
    return { dataUrl: `data:${type.split(';')[0]};base64,${buf.toString('base64')}` };
  }
  if (req.method === 'POST' && path === '/api/studio/analyze') {
    authorize(req);
    const { url, name, kit } = await readJson(req);
    const site = httpUrl(url);
    const s = await devin(`/organizations/${await org()}/sessions`, { method: 'POST', body: JSON.stringify({
      title: `Dino Studio · ${name || new URL(site).hostname}`,
      prompt: `You are the Dino Escape Brand Studio. Research only: no code, no repos, no PRs. Visit ${site}${name ? ` (${name})` : ''}${kit ? `, suggested asset kit: ${kit}` : ''} and build a brand pack to reskin a runner game (obstacles become brand items, coins become brand tokens, roadside billboards advertise the products). ${PACK_RULES} Put the pack in structured output, then wait: the owner may send follow-up change requests; for each one, update the whole pack in structured output.`,
      structured_output_schema: PACK_SCHEMA, tags: ['dino-studio'], max_acu_limit: 3,
    }) });
    return { session_id: s.session_id, url: s.url, status: s.status };
  }
  const m = path.match(/^\/api\/studio\/session\/([\w-]+)(\/message)?$/);
  if (m) authorize(req);
  const studioSession = async (id) => {
    const s = await devin(`/organizations/${await org()}/sessions/${id}`);
    if (!s.tags?.includes('dino-studio')) throw fail(404, 'not a studio session');
    return s;
  };
  if (m && req.method === 'GET' && !m[2]) {
    const s = await studioSession(m[1]);
    return { status: s.status, status_detail: s.status_detail, acus: s.acus_consumed, url: s.url, pack: s.structured_output };
  }
  if (m && req.method === 'POST' && m[2]) {
    const { text, pack } = await readJson(req);
    await studioSession(m[1]);
    await devin(`/organizations/${await org()}/sessions/${m[1]}/messages`, { method: 'POST', body: JSON.stringify({
      message: `Owner change request: ${text}\n\nCurrent pack (JSON): ${JSON.stringify(pack ?? {}).slice(0, 12000)}\n\nApply the request and put the complete updated pack in structured output. ${PACK_RULES}`,
    }) });
    return { ok: true };
  }
  return undefined;
}

export function studioApi() {
  const middleware = async (req, res, next) => {
    if (!req.url.startsWith('/api/studio/')) return next();
    try {
      const out = await handle(req);
      if (out === undefined) return next();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(out));
    } catch (e) {
      res.statusCode = e.status ?? 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
    }
  };
  return {
    name: 'dino-studio-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
