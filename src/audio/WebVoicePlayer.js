// Lecteur des répliques (public/voices) : WebAudio, préchargement du perso courant, baisse la musique pendant la voix.
export class WebVoicePlayer {
  constructor({ base = './voices/', onSpeak } = {}) {
    this.base = base;
    this.onSpeak = onSpeak; // (durée s) → baisse la musique
    this.buffers = new Map();
    this.pending = new Map();
    this.volume = 1;
  }

  async loadManifest() {
    const res = await fetch(`${this.base}manifest.json`);
    if (!res.ok) throw new Error(`voices manifest ${res.status}`);
    this.manifest = await res.json();
    return this.manifest;
  }

  setAudioContext(ctx) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(ctx.destination);
    this.preload(this.character);
  }

  // Décode en avance toutes les répliques d'un perso (+ curseur) pour zéro latence en course
  preload(character) {
    this.character = character;
    if (!this.ctx || !this.manifest) return;
    for (const c of [character, 'cursor']) {
      for (const lines of Object.values(this.manifest.lines[c] ?? {})) lines.forEach((l) => this.#load(l.file));
    }
  }

  #load(file) {
    if (this.buffers.has(file) || this.pending.has(file)) return;
    const p = fetch(this.base + file)
      .then((r) => r.arrayBuffer())
      .then((b) => this.ctx.decodeAudioData(b))
      .then((buf) => this.buffers.set(file, buf))
      .catch(() => {})
      .finally(() => this.pending.delete(file));
    this.pending.set(file, p);
  }

  play(file) {
    const buf = this.buffers.get(file);
    if (!this.ctx || !buf) { if (this.ctx) this.#load(file); return 0; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    src.start();
    this.source = src;
    this.onSpeak?.(buf.duration);
    return buf.duration;
  }

  stop() {
    try { this.source?.stop(); } catch { /* déjà terminée */ }
    this.source = null;
  }
}
