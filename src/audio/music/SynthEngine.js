import { range } from './engines.js';

// Musique de secours (sans clé API) : petit séquenceur WebAudio qui suit le tempo
// et ajoute des couches avec l'intensité (kick → hats → basse → arpèges).
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

  start(theme) {
    if (!this.ctx) return;
    this.stop();
    this.theme = theme;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.playing = true;
    this.timer = setInterval(() => this.#schedule(), 25);
  }

  stop() { this.playing = false; clearInterval(this.timer); }

  setIntensity(x) { this.x = x; }

  get bpm() { return this.theme ? range(this.theme.bpm, this.x) : 120; }

  #schedule() {
    const bpm = this.bpm;
    const dt16 = 60 / bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.#play(this.step, this.nextTime, dt16);
      this.nextTime += dt16;
      this.step = (this.step + 1) % 64;
    }
  }

  #play(i, t, dt16) {
    const x = this.x, s = i % 16, bar = Math.floor(i / 16);
    const { wave = 'sawtooth', scale = [0, 3, 5, 7, 10], root = 45 } = this.theme.synth || {};
    if (s % 4 === 0) { this.#kick(t); this.onKick?.(t); } // heure exacte du temps → synchro parfaite
    if (s % 4 === 2) this.#hat(t, 0.25);
    if (x > 0.45 && s % 2 === 1) this.#hat(t, 0.1);
    if (x > 0.25 && (s === 4 || s === 12)) this.#snare(t);
    if (x > 0.15 && s % 2 === 0) this.#tone(midi(root + scale[(bar + (s >> 2)) % scale.length]), t, dt16 * 1.8, wave, 0.35, 700);
    if (x > 0.6) this.#tone(midi(root + 24 + scale[(i * 3) % scale.length]), t, dt16 * 0.9, 'square', 0.12, 3000);
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

  #hat(t, vol) { this.#noiseHit(t, 0.05, vol, 'highpass', 7000); }
  #snare(t) { this.#noiseHit(t, 0.15, 0.4, 'bandpass', 1800); }

  #tone(freq, t, dur, type, vol, cutoff) {
    const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + dur);
  }
}
