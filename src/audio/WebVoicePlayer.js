// Lecteur des répliques (public/voices) : WebAudio, préchargement du perso courant, baisse la musique pendant la voix.
export class WebVoicePlayer {
  constructor({ base = './voices/', onSpeak } = {}) {
    this.base = base;
    this.onSpeak = onSpeak; // (durée s) → baisse la musique
    this.buffers = new Map();
    this.pending = new Map();
    this.volume = 1;
    this.seq = 0;
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
    if (this.queued && performance.now() - this.queued.at < 1500) this.play(this.queued.file);
    this.queued = null;
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
    if (this.buffers.has(file)) return Promise.resolve();
    if (this.pending.has(file)) return this.pending.get(file);
    const p = fetch(this.base + file)
      .then((r) => r.arrayBuffer())
      .then((b) => this.ctx.decodeAudioData(b))
      .then((buf) => this.buffers.set(file, buf))
      .catch(() => {})
      .finally(() => this.pending.delete(file));
    this.pending.set(file, p);
    return p;
  }

  // Réplique pas encore décodée (ou contexte audio pas encore créé) : jouée dès qu'elle est prête,
  // sauf si une autre réplique l'a remplacée entre-temps ou si elle arrive trop tard.
  play(file) {
    const token = ++this.seq;
    if (!this.ctx) { this.queued = { file, at: performance.now() }; return 0; }
    const buf = this.buffers.get(file);
    if (buf) return this.#start(buf);
    const at = performance.now();
    this.#load(file).then(() => {
      const ready = this.buffers.get(file);
      if (ready && token === this.seq && performance.now() - at < 1500) this.#start(ready);
    });
    return 0;
  }

  #start(buf) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    src.start();
    this.source = src;
    this.onSpeak?.(buf.duration);
    return buf.duration;
  }

  stop() {
    this.seq++;
    this.queued = null;
    try { this.source?.stop(); } catch { /* déjà terminée */ }
    this.source = null;
  }
}
