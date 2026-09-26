

// Musique de secours (sans clé API) : séquenceur WebAudio entraînant qui suit le tempo du jeu.
// La couleur vient de theme.synth : { wave, scale (demi-tons), root (note MIDI) }.
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export class SynthEngine {
  x = 0;
  playing = false;

  setAudioContext(ctx) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.16;
    this.out.connect(ctx.destination);
    const len = ctx.sampleRate * 0.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  start(theme, tempo = { ratio: 1 }) {
    if (!this.ctx) return;
    this.stop();
    this.theme = theme;
    this.ratio = tempo.ratio;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.playing = true;
    this.timer = setInterval(() => this.#schedule(), 25);
  }

  stop() { this.playing = false; clearInterval(this.timer); }

  setIntensity(x) { this.x = x; } // nombre de couches (kick → hats → basse → arpèges)

  // Nouveau palier : accélération progressive à partir de la prochaine mesure
  setTempo(tempo) {
    if (!this.playing) { this.ratio = tempo.ratio; return false; }
    this.pendingRatio = tempo.ratio;
    return true;
  }

  get bpm() { return this.theme ? this.theme.bpm * (this.ratio ?? 1) : 120; }
  get clockBpm() { return this.bpm; }

  #schedule() {
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      if (this.pendingRatio && this.step % 16 === 0) { // début de mesure : accélération sur 1 mesure
        this.glide = { from: this.ratio, to: this.pendingRatio, step: 0 };
        this.pendingRatio = null;
      }
      if (this.glide) {
        const g = this.glide, k = ++g.step / 16;
        this.ratio = g.from + (g.to - g.from) * Math.min(1, k);
        if (k >= 1) this.glide = null;
      }
      const dt16 = 60 / this.bpm / 4;
      this.#play(this.step, this.nextTime, dt16);
      this.nextTime += dt16;
      this.step = (this.step + 1) % 64;
    }
  }

  // Groove "tube" : kick 4/4, claps sur 2 et 4, charlestons en doubles croches, basse à
  // contretemps bondissante et mélodie accrocheuse (theme.synth.hook) qui revient toutes les 2 mesures.
  // L'intensité (palier) ajoute la charleston ouverte, les arpèges puis un kick renforcé.
  #play(i, t, dt16) {
    const x = this.x, s = i % 16, bar = Math.floor(i / 16) % 4;
    const { wave = 'sawtooth', scale = [0, 3, 5, 7, 10], root = 45, hook } = this.theme.synth || {};
    const note = (deg, oct = 0) => midi(root + 12 * oct + scale[((deg % scale.length) + scale.length) % scale.length] + 12 * Math.floor(deg / scale.length));
    const chord = [0, 0, 3, 4][bar]; // petite grille qui tourne sur 4 mesures

    if (s % 4 === 0) this.#kick(t);
    if (s === 4 || s === 12) this.#clap(t);
    this.#hat(t, s % 2 ? 0.08 : 0.16);                                     // doubles croches
    if (x > 0.4 && s % 4 === 2) this.#noiseHit(t, 0.12, 0.18, 'highpass', 6000); // charleston ouverte
    if (s % 4 === 2 || s % 4 === 3) this.#tone(note(chord), t, dt16 * 0.9, wave, 0.4, 900); // basse à contretemps
    const h = hook ?? [0, 2, 4, 2, 0, 2, 4, 5, 0, 2, 4, 2, 7, 5, 4, 2];
    const step = (i % 32) >> 1;                                              // mélodie en croches sur 2 mesures
    if (s % 2 === 0 && h[step] !== undefined && (s % 8 !== 6 || x > 0.3)) {
      const deg = Math.round(h[step] / 2) + chord;
      this.#tone(note(deg, 2), t, dt16 * 1.6, 'square', 0.13, 3200);
    }
    if (x > 0.6) this.#tone(note(chord + (i % 3) * 2, 3), t, dt16 * 0.7, 'square', 0.07, 5000); // arpèges
    if (x > 0.8 && s % 4 === 0) this.#kick(t + 0.001);                        // kick renforcé
  }

  #clap(t) {
    for (const d of [0, 0.012, 0.025]) this.#noiseHit(t + d, 0.09, 0.3, 'bandpass', 1500);
  }

  #kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.3);
  }

  #noiseHit(t, dur, vol, type, freq) {
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.out); src.start(t); src.stop(t + dur);
  }

  #hat(t, vol) { this.#noiseHit(t, 0.04, vol, 'highpass', 8000); }

  #tone(freq, t, dur, type, vol, cutoff) {
    const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + dur);
  }
}
