// Sons 100 % synthétisés (WebAudio) : aucun fichier à charger.
export class Sfx {
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Moteur : deux dents de scie filtrées
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 900;
    this.engineGain.connect(filter).connect(this.master);
    this.osc1 = this.ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = this.ctx.createOscillator(); this.osc2.type = 'square';
    this.osc1.connect(this.engineGain); this.osc2.connect(this.engineGain);
    this.osc1.start(); this.osc2.start();

    // Crissement de drift : bruit filtré
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 3;
    this.skidGain = this.ctx.createGain(); this.skidGain.gain.value = 0;
    src.connect(bp).connect(this.skidGain).connect(this.master);
    src.start();
  }

  engine(speed, on, drifting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 45 + speed * 2.2;
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.501, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0, t, 0.1); // pas de moteur : c'est un dino
    this.skidGain.gain.setTargetAtTime(on && drifting ? 0.08 : 0, t, 0.05);
  }

  tone(freq, dur, type = 'square', vol = 0.15, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type;
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  noise(dur, vol = 0.3, freq = 800) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur);
  }

  coin() { this.tone(988, 0.08, 'square', 0.1); setTimeout(() => this.tone(1319, 0.12, 'square', 0.1), 60); }
  boost(big) { this.tone(big ? 300 : 220, 0.45, 'sawtooth', 0.12, big ? 900 : 500); this.noise(0.4, 0.15, 3000); }
  crash() { this.noise(0.5, 0.5, 600); this.tone(120, 0.4, 'square', 0.2, -80); }
  zone() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.15, 'triangle', 0.15), i * 90)); }
  over() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'square', 0.12), i * 130)); }
  jump() { this.tone(620, 0.09, 'square', 0.12, 300); }
  step(heavy) { this.noise(heavy ? 0.12 : 0.05, heavy ? 0.35 : 0.12, heavy ? 300 : 500); }
  click() { this.tone(1800, 0.03, 'square', 0.2); }
}
