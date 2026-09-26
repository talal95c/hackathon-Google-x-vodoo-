import { range, levelOf } from './engines.js';

// palier de tempo : 0 pour les niveaux bas, 1 pour les niveaux hauts
const tier = (theme, lvl) => (lvl >= theme.levels.length / 2 ? 1 : 0);

// Musique générée en temps réel par Google DeepMind Lyria RealTime.
// Adapté du LyriaLiveDJ de la branche feat/dino-game.
//
// - Prompt "core" permanent (identité du thème) + prompt du palier d'intensité, mélangés
//   par poids ; changement de palier = fondu de ~3 s (pas de coupure).
// - Le BPM ne change qu'une fois (paliers bas → hauts) avec resetContext → effet "drop".
// - Densité et brillance suivent l'intensité du jeu en continu.
//
// Clé API : saisie par le joueur (stockée dans son navigateur). La clé du .env
// (VITE_GEMINI_API_KEY) n'est utilisée qu'en développement : ne jamais la mettre dans un build public.
const MODEL = 'models/lyria-realtime-exp';
const API_VERSION = 'v1alpha'; // version indiquée par la doc Lyria RealTime
const KEY_STORAGE = 'gemini_api_key';

export class LyriaEngine {
  status = 'off';     // off | connecting | ready | playing | error
  message = '';
  #listeners = new Set();
  #session = null;
  #sources = new Set();

  constructor() {
    let saved = '';
    try { saved = localStorage.getItem(KEY_STORAGE) || ''; } catch { /* stockage bloqué */ }
    this.apiKey = saved || (import.meta.env?.DEV ? import.meta.env.VITE_GEMINI_API_KEY || '' : '');
  }

  // Tempo imposé à Lyria (le vrai tempo peut dériver un peu : le BeatTracker corrige)
  get bpm() { return this.theme ? this.theme.bpm[tier(this.theme, this.level)] : 120; }

  get ready() { return this.status === 'ready' || this.status === 'playing'; }
  hasKey() { return this.apiKey.length > 10; }
  onStatus(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #set(status, message = '') { this.status = status; this.message = message; this.#listeners.forEach((fn) => fn(status, message)); }

  setApiKey(key) {
    this.apiKey = (key || '').trim();
    try { this.apiKey ? localStorage.setItem(KEY_STORAGE, this.apiKey) : localStorage.removeItem(KEY_STORAGE); } catch { /* */ }
  }

  setAudioContext(ctx) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.45;
    this.out.connect(ctx.destination);
  }

  async connect() {
    if (!this.hasKey()) { this.#set('off', 'Clé API Gemini requise'); return false; }
    if (this.ready) return true;
    this.#set('connecting', 'Connexion à Lyria RealTime…');
    try {
      const { GoogleGenAI } = await import('@google/genai'); // chargé seulement si besoin
      const ai = new GoogleGenAI({ apiKey: this.apiKey, apiVersion: API_VERSION });
      this.#session = await ai.live.music.connect({
        model: MODEL,
        callbacks: {
          onmessage: (msg) => this.#onMessage(msg),
          onerror: (e) => { console.warn('[Lyria]', e); this.#set('error', 'Erreur du flux Lyria'); },
          onclose: () => { this.#session = null; if (this.status !== 'error') this.#set('off', 'Lyria déconnecté'); },
        },
      });
      this.#set('ready', 'Lyria prêt 🎶');
      return true;
    } catch (e) {
      console.warn('[Lyria] connexion impossible', e);
      this.#session = null;
      this.#set('error', e.message || 'Connexion impossible');
      return false;
    }
  }

  async start(theme) {
    if (!this.#session) return false;
    this.theme = theme;
    this.level = 0;
    this.intensity = 0;
    this.lastConfig = 0;
    this.lastLevelChange = performance.now();
    this.nextTime = this.ctx.currentTime + 0.25;
    try {
      await this.#prompts(0, null, 0);
      await this.#applyConfig();
      this.#session.play();
      this.onRestart?.();
    } catch (e) { console.warn('[Lyria] démarrage', e); return false; }
    this.#set('playing', `Lyria : ${theme.name}`);
    return true;
  }

  stop() {
    clearInterval(this.fadeTimer);
    for (const s of this.#sources) { try { s.stop(); } catch { /* */ } }
    this.#sources.clear();
    if (this.#session) { try { this.#session.stop(); } catch { /* */ } }
    if (this.status === 'playing') this.#set('ready', 'Lyria prêt 🎶');
  }

  setIntensity(x) {
    if (this.status !== 'playing' || !this.theme) return;
    this.intensity = x;
    const lvl = levelOf(this.theme, x), now = performance.now();
    if (lvl !== this.level && !this.fading && now - this.lastLevelChange > 8000) this.#changeLevel(lvl);
    else if (!this.fading && now - this.lastConfig > 3000) this.#applyConfig();
  }

  // core (identité, poids fixe) + palier courant, avec éventuellement l'ancien palier en fondu
  #prompts(lvl, oldLvl, p) {
    const t = this.theme, list = [{ text: t.core, weight: 1 }];
    if (oldLvl !== null && p < 1) list.push({ text: t.levels[oldLvl], weight: +(1.2 * (1 - p)).toFixed(2) || 0.05 });
    list.push({ text: t.levels[lvl], weight: +(1.2 * (oldLvl === null ? 1 : Math.max(0.05, p))).toFixed(2) });
    return this.#session.setWeightedPrompts({ weightedPrompts: list });
  }

  // Fondu entre paliers sur ~3 s ; le tempo ne change qu'en passant la moitié (paliers 0-1 → 2-3)
  #changeLevel(lvl) {
    const old = this.level, tempoChange = tier(this.theme, old) !== tier(this.theme, lvl);
    this.level = lvl;
    this.fading = true;
    this.lastLevelChange = performance.now();
    let step = 0;
    const STEPS = 4;
    const run = async () => {
      step++;
      const p = step / STEPS;
      try {
        await this.#prompts(lvl, old, p);
        if (p >= 1) {
          clearInterval(this.fadeTimer);
          await this.#applyConfig();
          if (tempoChange) { this.#session.resetContext(); this.onRestart?.(); } // nouveau BPM = relance : effet "drop"
          this.fading = false;
        }
      } catch (e) { clearInterval(this.fadeTimer); this.fading = false; }
    };
    run();
    this.fadeTimer = setInterval(run, 800);
  }

  async #applyConfig() {
    this.lastConfig = performance.now();
    const t = this.theme, x = this.intensity;
    const config = {
      density: +range(t.density, x).toFixed(2),
      brightness: +range(t.brightness, x).toFixed(2),
      guidance: 3.5,          // un peu moins strict = transitions plus douces
      musicGenerationMode: 'QUALITY',
    };
    // BPM et tonalité ne s'appliquent qu'après resetContext : on les renvoie à chaque fois
    // (sinon Lyria revient aux valeurs par défaut), mais on ne relance qu'aux changements de palier.
    config.bpm = t.bpm[tier(t, this.level)];
    if (t.scale) config.scale = t.scale;
    try { await this.#session.setMusicGenerationConfig({ musicGenerationConfig: config }); } catch { /* session fermée */ }
  }

  // PCM 16 bits stéréo 48 kHz en base64 → file de lecture sans trou
  #onMessage(msg) {
    const chunks = msg.serverContent?.audioChunks;
    if (!chunks || this.status !== 'playing' || !this.ctx) return;
    for (const c of chunks) if (c.data) this.#enqueue(c.data);
  }

  #enqueue(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);
    const frames = pcm.length >> 1;
    if (!frames) return;
    const buf = this.ctx.createBuffer(2, frames, 48000);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let i = 0; i < frames; i++) { L[i] = pcm[2 * i] / 32768; R[i] = pcm[2 * i + 1] / 32768; }
    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.1;
    this.onPcm?.(L, 48000, this.nextTime); // analyse du rythme sur l'audio avant qu'il soit joué
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    src.start(this.nextTime);
    this.nextTime += buf.duration;
    this.#sources.add(src);
    src.onended = () => this.#sources.delete(src);
  }
}
