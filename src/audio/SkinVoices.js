import { voiceFor, pickLine } from '../content/voices.js';

// Voix des skins : chaque dino balance une réplique quand il lance une claque.
// Les clips sont GÉNÉRÉS À L'AVANCE (npm run voices:gen → public/voices/, Gemini TTS) : ici on ne
// fait que charger des fichiers audio statiques. Aucune clé, aucun appel API, zéro latence en jeu.
// - warm(skins) : précharge + décode les clips des skins présents au départ de la course.
// - say(skin) : joue une réplique de son inventaire (jamais la même deux fois de suite),
//   accélérée pour tenir en ~1 s (jeu ultra dynamique), position stéréo selon le dino.
// Sans clips générés : silence, la claque garde son bruitage.
const MANIFEST = 'voices/index.json';
const TARGET = 1.0;            // durée visée à l'oreille : le clip est accéléré pour y tenir (×1.1 à ×1.4)
const ENABLED_STORAGE = 'dino-escape-skin-voices';

export class SkinVoices {
  enabled = true;
  #manifest = null;       // Promise<{ skin: { voiceName, lines: [{ text, file }] } } | null>
  #clips = new Map();     // fichier → AudioBuffer (décodé, prêt à jouer)
  #raw = new Map();       // fichier → ArrayBuffer (téléchargé, pas encore décodé : l'audio n'est pas démarré)
  #loading = new Map();   // fichier → Promise
  #last = new Map();      // skin → dernière réplique dite
  #playing = null;        // { source, at, mine }

  constructor({ sfx, base = import.meta.env?.BASE_URL ?? '/' } = {}) {
    this.sfx = sfx;
    this.base = base.endsWith('/') ? base : base + '/';
    try { this.enabled = localStorage.getItem(ENABLED_STORAGE) !== '0'; } catch { /* stockage bloqué */ }
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem(ENABLED_STORAGE, on ? '1' : '0'); } catch { /* */ }
  }

  // Télécharge tous les clips dès l'ouverture de la page (≈ 0,5 Mo) : au départ de la course il ne
  // reste que le décodage, quasi instantané
  async preload() {
    const manifest = await this.#load();
    for (const entry of Object.values(manifest ?? {})) for (const clip of entry.lines) this.#fetch(clip.file).catch(() => {});
  }

  // Décode les inventaires des skins donnés (une seule fois par clip)
  async warm(skinIds) {
    if (!this.enabled) return;
    const manifest = await this.#load();
    if (!manifest) return;
    for (const id of new Set(skinIds)) {
      for (const clip of this.#entry(manifest, id)?.lines ?? []) this.#fetch(clip.file).catch(() => {});
    }
  }

  // Le dino "skinId" lance une claque : joue une de ses répliques si elle est prête.
  // pos = { dir, distance } pour la stéréo et le volume ; mine = le joueur (prioritaire).
  say(skinId, { dir = 0, distance = 0, mine = false } = {}) {
    if (!this.enabled || !this.sfx.ctx) return null;
    const entry = this.#manifestSync && this.#entry(this.#manifestSync, skinId);
    if (!entry) { this.warm([skinId]); return null; }
    const ready = entry.lines.filter((l) => this.#clips.has(l.file));
    if (!ready.length) { this.warm([skinId]); return null; }
    const line = pickLine({ lines: ready.map((l) => l.text) }, this.#last.get(skinId));
    this.#last.set(skinId, line);
    const now = this.sfx.ctx.currentTime;
    if (this.#playing) { // une seule voix à la fois : le joueur coupe les autres, les rivaux attendent
      const p = this.#playing;
      if (!mine && (p.mine || now - p.at < 0.5)) return null;
      try { p.source.stop(); } catch { /* déjà finie */ }
    }
    const clip = this.#clips.get(ready.find((l) => l.text === line).file);
    const rate = Math.min(1.4, Math.max(1.1, clip.duration / TARGET));
    const volume = mine ? 1 : Math.max(0.3, 1 - distance / 45);
    const source = this.sfx.voice(clip, { pan: mine ? 0 : -dir * 0.35, volume, rate });
    if (!source) return null;
    this.#playing = { source, at: now, mine };
    source.addEventListener('ended', () => { if (this.#playing?.source === source) this.#playing = null; });
    return line;
  }

  // Le skin réel s'il a des clips, sinon la voix par défaut (classic), comme voiceFor()
  #entry(manifest, skinId) { return manifest[skinId] || manifest[voiceFor(skinId) === voiceFor('classic') ? 'classic' : skinId] || manifest.classic || null; }

  #manifestSync = null;
  #load() {
    if (this.#manifest) return this.#manifest;
    this.#manifest = (async () => {
      try {
        const res = await fetch(this.base + MANIFEST, { cache: 'force-cache' });
        if (!res.ok) throw new Error(res.status);
        this.#manifestSync = await res.json();
      } catch (e) { console.info('[Voices] pas de clips pré-générés (npm run voices:gen)', e.message || e); this.#manifestSync = null; }
      return this.#manifestSync;
    })();
    return this.#manifest;
  }

  // Téléchargement, puis décodage dès que l'audio est démarré (sfx.init() après un geste du joueur)
  #fetch(file) {
    if (this.#clips.has(file)) return Promise.resolve(this.#clips.get(file));
    if (this.#loading.has(file)) return this.#loading.get(file);
    const p = (async () => {
      if (!this.#raw.has(file)) {
        const res = await fetch(this.base + 'voices/' + file, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`${file}: ${res.status}`);
        this.#raw.set(file, await res.arrayBuffer());
      }
      const ctx = this.sfx.ctx;
      if (!ctx) return null; // téléchargé seulement : décodé au prochain warm()
      const buffer = await ctx.decodeAudioData(this.#raw.get(file).slice(0));
      this.#clips.set(file, buffer);
      this.#raw.delete(file);
      return buffer;
    })().finally(() => this.#loading.delete(file));
    this.#loading.set(file, p);
    return p;
  }
}

// Branche les voix sur les événements de claque (joueur, PNJ, joueurs en ligne)
export function bindVoices(game, voices, { mp, bots }) {
  const near = (s) => Math.abs(s - game.runner.z) < 40;
  const rel = (s, d) => ({ distance: Math.hypot(s - game.runner.z, d - game.runner.x), dir: Math.sign(d - game.runner.x) || 0 });
  game.on('game:start', ({ loadout }) => voices.warm([loadout.skin, ...[...mp.peers.values()].map((p) => p.skin)])); // moi, puis les joueurs en ligne
  game.on('bots:start', ({ skins }) => voices.warm(skins));                                                  // PNJ du solo (créés juste après game:start)
  game.on('mp:shove', () => voices.say(game.loadout?.skin, { mine: true }));                                // moi
  game.on('bot:shove', ({ skin, s, d }) => { if (skin && near(s)) voices.say(skin, rel(s, d)); });          // PNJ
  game.on('combat:impact', (e) => {                                                                          // joueur en ligne (jamais moi : déjà dit sur mp:shove)
    if (e.kind !== 'shove' || !e.sourceId || e.local === 'dealt' || !near(e.s)) return;
    const peer = mp.peers.get(e.sourceId);
    if (peer) voices.say(peer.skin, rel(e.s, e.d));
  });
}
