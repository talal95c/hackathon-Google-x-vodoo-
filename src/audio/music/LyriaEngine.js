import { promptIndex } from './engines.js';
import { GAME } from '../../kernel/config.js';

// Musique générée en temps réel par Google DeepMind Lyria RealTime (adapté du LyriaLiveDJ
// de la branche feat/dino-game), en "mode DJ" :
//
// - Prompt "core" (identité du thème) + prompt d'énergie du palier + voix optionnelles
//   (mode VOCALIZATION de Lyria).
// - Rien ne change en dehors des paliers de tempo du jeu (événement 'tempo') : pas de
//   variation parasite quand on se prend un obstacle.
// - Transition de palier façon DJ, calée sur les mesures, SANS coupure :
//     1. au début de la prochaine mesure, le filtre adoucit légèrement le son sur 2 mesures ;
//     2. puis : nouveau prompt + nouveau BPM + resetContext (Lyria ne change de tempo qu'ainsi) ;
//     3. le nouvel audio démarre sur un temps et fait un fondu enchaîné d'une mesure avec
//        l'ancien (deux bus de volume qui se croisent), puis le filtre se rouvre sur 2 mesures.
//
// Clé API : saisie par le joueur (stockée dans son navigateur). La clé du .env
// (VITE_GEMINI_API_KEY) n'est utilisée qu'en développement : ne jamais la mettre dans un build public.
const MODEL = 'models/lyria-realtime-exp';
const API_VERSION = 'v1alpha'; // version indiquée par la doc Lyria RealTime
const KEY_STORAGE = 'gemini_api_key';
const VOCALS_STORAGE = 'dino-escape-vocals';
const OPEN = 20000, SOFT = 1200; // filtre DJ : ouvert / adouci (Hz)

export class LyriaEngine {
  status = 'off';     // off | connecting | ready | playing | error
  message = '';
  vocals = true;      // mode voix (VOCALIZATION)
  ratio = 1;
  #listeners = new Set();
  #session = null;
  #sources = new Set();

  constructor() {
    let saved = '';
    try {
      saved = localStorage.getItem(KEY_STORAGE) || '';
      this.vocals = localStorage.getItem(VOCALS_STORAGE) !== '0';
    } catch { /* stockage bloqué */ }
    this.apiKey = saved || (import.meta.env?.DEV ? import.meta.env.VITE_GEMINI_API_KEY || '' : '');
  }

  // Tempo imposé à Lyria = bpm du thème × ratio du palier du jeu
  get bpm() { return this.theme ? Math.round(this.theme.bpm * this.ratio) : 120; }
  // Tempo réellement entendu (change au drop, pas à la demande) : pour l'horloge du jeu
  get clockBpm() { return this.theme ? Math.round(this.theme.bpm * (this.audibleRatio ?? this.ratio)) : 120; }
  get ready() { return this.status === 'ready' || this.status === 'playing'; }
  hasKey() { return this.apiKey.length > 10; }
  onStatus(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #set(status, message = '') { this.status = status; this.message = message; this.#listeners.forEach((fn) => fn(status, message)); }

  setApiKey(key) {
    this.apiKey = (key || '').trim();
    try { this.apiKey ? localStorage.setItem(KEY_STORAGE, this.apiKey) : localStorage.removeItem(KEY_STORAGE); } catch { /* */ }
  }

  setVocals(on) {
    this.vocals = on;
    try { localStorage.setItem(VOCALS_STORAGE, on ? '1' : '0'); } catch { /* */ }
  }

  // Chaîne audio : sources → filtre DJ → volume → sortie
  setAudioContext(ctx) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = OPEN;
    this.filter.Q.value = 0.8;
    this.out = ctx.createGain();
    this.out.gain.value = 0.45;
    this.filter.connect(this.out).connect(ctx.destination);
    this.bus = this.#newBus(1);
  }

  // Un bus de volume par "contexte" Lyria : permet le fondu enchaîné entre deux tempos
  #newBus(gain) {
    const b = this.ctx.createGain();
    b.gain.value = gain;
    b.connect(this.filter);
    return b;
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

  async start(theme, tempo = { level: 0, ratio: 1 }) {
    if (!this.#session) return false;
    this.theme = theme;
    this.ratio = this.audibleRatio = tempo.ratio;
    this.level = promptIndex(theme, tempo.level, GAME.tempoLevels.length);
    this.pending = null;
    this.switchAt = null;
    this.nextTime = this.ctx.currentTime + 0.25;
    this.filter.frequency.cancelScheduledValues(0);
    this.filter.frequency.value = OPEN;
    this.bus.gain.cancelScheduledValues(0);
    this.bus.gain.value = 1;
    try {
      await this.#sendPrompts();
      await this.#sendConfig();
      this.#session.play();
      this.onRestart?.();
    } catch (e) { console.warn('[Lyria] démarrage', e); return false; }
    this.#set('playing', `Lyria : ${theme.name}`);
    return true;
  }

  stop() {
    clearTimeout(this.switchTimer);
    this.pending = null;
    for (const s of this.#sources) { try { s.stop(); } catch { /* */ } }
    this.#sources.clear();
    if (this.#session) { try { this.#session.stop(); } catch { /* */ } }
    if (this.status === 'playing') this.#set('ready', 'Lyria prêt 🎶');
  }

  // Nouveau palier de vitesse du jeu → transition DJ vers le tempo correspondant
  setTempo(tempo) {
    if (this.status !== 'playing' || !this.theme) { this.ratio = this.audibleRatio = tempo.ratio; return false; }
    if (tempo.ratio === this.ratio && !this.pending) return false;
    this.pending = tempo; // si une transition est déjà en cours, elle prendra le dernier palier
    if (!this.switchTimer) this.#scheduleTransition();
    return true;
  }

  setIntensity() { /* mode DJ : rien ne bouge entre deux paliers */ }

  #scheduleTransition() {
    const now = this.ctx.currentTime;
    const beat = 60 / this.bpm;
    const start = this.nextBarTime?.(now + 0.1) ?? now + 0.1; // début de la prochaine mesure (fourni par MusicDirector)
    const end = start + 8 * beat;                              // balayage sur 2 mesures
    const f = this.filter.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.setValueAtTime(OPEN, start);
    f.exponentialRampToValueAtTime(SOFT, end);
    this.switchTimer = setTimeout(() => this.#doSwitch(end), Math.max(0, (end - now) * 1000 - 120));
  }

  async #doSwitch(switchTime) {
    this.switchTimer = null;
    const tempo = this.pending;
    this.pending = null;
    if (!tempo || this.status !== 'playing') return;
    this.ratio = tempo.ratio;
    this.level = promptIndex(this.theme, tempo.level, GAME.tempoLevels.length);
    try {
      await this.#sendPrompts();
      await this.#sendConfig();
      this.#session.resetContext();
      this.switchAt = switchTime; // le prochain audio reçu démarrera sur un temps à partir d'ici
      this.onRestart?.();
    } catch (e) { console.warn('[Lyria] transition', e); }
  }

  #sendPrompts() {
    const t = this.theme;
    const core = this.vocals ? t.core : `${t.core}, Instrumental`;
    const list = [{ text: core, weight: 1 }, { text: t.levels[this.level], weight: 1.2 }];
    if (this.vocals && t.vocals) list.push({ text: t.vocals, weight: 0.9 });
    return this.#session.setWeightedPrompts({ weightedPrompts: list });
  }

  // Densité / brillance fixées par palier (montent avec l'énergie), BPM et tonalité du thème
  #sendConfig() {
    const t = this.theme, x = this.level / Math.max(1, t.levels.length - 1);
    const lerp = ([a, b]) => +(a + (b - a) * x).toFixed(2);
    return this.#session.setMusicGenerationConfig({
      musicGenerationConfig: {
        bpm: this.bpm,
        density: lerp(t.density),
        brightness: lerp(t.brightness),
        guidance: 3.5,
        scale: t.scale,
        musicGenerationMode: this.vocals ? 'VOCALIZATION' : 'QUALITY',
      },
    });
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

    if (this.switchAt !== null) {
      // 1er audio au nouveau tempo : démarre sur un temps, fondu enchaîné d'une mesure avec l'ancien
      const t = this.nextBeatTime?.(Math.max(this.switchAt, now + 0.08)) ?? Math.max(this.switchAt, now + 0.08);
      const bar = (4 * 60) / this.bpm;
      const old = this.bus;
      old.gain.cancelScheduledValues(now);
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.setValueAtTime(1, t);
      old.gain.linearRampToValueAtTime(0, t + bar);
      for (const s of this.#sources) if (s.bus === old) { try { s.stop(t + bar + 0.05); } catch { /* */ } }
      setTimeout(() => old.disconnect(), (t + bar + 0.3 - now) * 1000);
      this.bus = this.#newBus(0);
      this.bus.gain.setValueAtTime(0, t);
      this.bus.gain.linearRampToValueAtTime(1, t + bar);
      this.nextTime = t;
      const f = this.filter.frequency;
      f.cancelScheduledValues(now);
      f.setValueAtTime(f.value, now);
      f.setValueAtTime(SOFT, t);
      f.exponentialRampToValueAtTime(OPEN, t + 2 * bar); // réouverture douce sur 2 mesures
      this.switchAt = null;
      this.audibleRatio = this.ratio;
    }

    if (this.nextTime < now) this.nextTime = now + 0.1;
    this.onPcm?.(L, 48000, this.nextTime); // analyse du rythme sur l'audio avant qu'il soit joué
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.bus = this.bus;
    src.connect(this.bus);
    src.start(this.nextTime);
    this.nextTime += buf.duration;
    this.#sources.add(src);
    src.onended = () => this.#sources.delete(src);
  }
}
