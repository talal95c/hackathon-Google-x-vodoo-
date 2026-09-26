// Bruitages 100 % synthétisés (WebAudio) : aucun fichier à charger.
// bindSfx(game, sfx) branche les sons sur les événements du kernel.
export class Sfx {
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 5;
    limiter.attack.value = .002; limiter.release.value = .09;
    this.master.connect(limiter).connect(this.ctx.destination);
    this.onInit?.(this.ctx);

    // Crissement de drift : bruit filtré
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // Nouveau « smack » : attaque sèche, double contact des doigts, puis corps grave très court.
    this.slapBuf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * .12), this.ctx.sampleRate);
    const slap = this.slapBuf.getChannelData(0);
    let previous = 0, low = 0;
    for (let i = 0; i < slap.length; i++) {
      const t = i / this.ctx.sampleRate, white = Math.random() * 2 - 1;
      low += (white - low) * .24;
      const snap = (white - previous * .88) * Math.exp(-t * 280) * 1.1;
      const fingers = low * (Math.exp(-Math.abs(t - .005) * 420) * 1.2 + Math.exp(-Math.abs(t - .012) * 550) * .6);
      const palm = (Math.sin(2 * Math.PI * 235 * t) + .38 * Math.sin(2 * Math.PI * 470 * t)) * Math.exp(-t * 70) * .62;
      slap[i] = Math.tanh((snap + fingers + palm) * 2) * Math.min(1, t * 12000);
      previous = white;
    }
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 3;
    this.skidGain = this.ctx.createGain(); this.skidGain.gain.value = 0;
    src.connect(bp).connect(this.skidGain).connect(this.master);
    src.start();
  }

  // Crissement pendant la glissade
  skid(on) {
    if (!this.ctx) return;
    this.skidGain.gain.setTargetAtTime(on ? 0.08 : 0, this.ctx.currentTime, 0.05);
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

  slap(dir = 0, volume = 1) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.slapBuf;
    src.playbackRate.value = .85 + Math.random() * .18;
    const gain = this.ctx.createGain(); gain.gain.value = 1.05 * volume;
    const pan = this.ctx.createStereoPanner(); pan.pan.value = Math.max(-.45, Math.min(.45, -dir * .3));
    src.connect(gain).connect(pan).connect(this.master);
    src.onended = () => { src.disconnect(); gain.disconnect(); pan.disconnect(); };
    src.start();
  }

  explosion() {
    this.slap(0, 1.1); this.noise(.38, .45, 1900); this.noise(.65, .3, 360);
    this.tone(105, .32, 'sine', .45, -72);
  }
  whoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    src.buffer = this.noiseBuf; filter.type = 'bandpass'; filter.Q.value = .8;
    filter.frequency.setValueAtTime(600, t); filter.frequency.exponentialRampToValueAtTime(3600, t + .18); filter.frequency.exponentialRampToValueAtTime(700, t + .38);
    gain.gain.setValueAtTime(.001, t); gain.gain.linearRampToValueAtTime(.24, t + .12); gain.gain.exponentialRampToValueAtTime(.001, t + .4);
    src.connect(filter).connect(gain).connect(this.master); src.start(t); src.stop(t + .4);
    src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  cheer() {
    this.noise(.42, .14, 1800);
    this.tone(620, .16, 'triangle', .055, 180);
    setTimeout(() => this.tone(880, .18, 'triangle', .045, 130), 100);
  }
  // Réplique vocale (AudioBuffer déjà décodé) : position stéréo et volume, renvoie la source
  voice(buffer, { pan = 0, volume = 1, rate = 1 } = {}) {
    if (!this.ctx || !buffer) return null;
    const src = this.ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
    const gain = this.ctx.createGain(); gain.gain.value = 1.4 * volume;
    const panner = this.ctx.createStereoPanner(); panner.pan.value = Math.max(-.6, Math.min(.6, pan));
    src.connect(gain).connect(panner).connect(this.master);
    src.onended = () => { src.disconnect(); gain.disconnect(); panner.disconnect(); };
    src.start();
    return src;
  }

  coin() { this.tone(988, 0.08, 'square', 0.1); setTimeout(() => this.tone(1319, 0.12, 'square', 0.1), 60); }
  pickup() { [784, 988, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'triangle', 0.1, f * 0.05), i * 55)); }
  boost(big) { this.tone(big ? 300 : 220, 0.45, 'sawtooth', 0.12, big ? 900 : 500); this.noise(0.4, 0.15, 3000); }
  crash() { this.noise(0.5, 0.5, 600); this.tone(120, 0.4, 'square', 0.2, -80); }
  zone() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.15, 'triangle', 0.15), i * 90)); }
  over() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'square', 0.12), i * 130)); }
  jump() { this.tone(620, 0.09, 'square', 0.12, 300); }
  step(heavy) { this.noise(heavy ? 0.12 : 0.05, heavy ? 0.35 : 0.12, heavy ? 300 : 500); }
  click() { this.tone(1800, 0.03, 'square', 0.2); }
}

export function bindSfx(game, sfx) {
  const on = (t, fn) => game.on(t, fn);
  on('club:approach', () => { sfx.whoosh(); sfx.tone(440, .3, 'triangle', .1, 440); });
  on('club:countdown', ({ tick }) => sfx.tone(tick === 1 ? 880 : 440, .11, 'triangle', .15));
  on('club:phase', ({ phase }) => { if (phase === 'tapping') { sfx.tone(880, .2, 'triangle', .18, 440); } });
  on('club:hit', ({ index, count }) => { sfx.slap(index ? 1 : -1, .8); if (count > 0 && count % 10 === 0) sfx.cheer(); });
  on('club:finisher', () => { sfx.explosion(); sfx.cheer(); });
  on('club:acrobatics', () => sfx.whoosh());
  on('mp:shove', () => sfx.noise(.09, .13, 3200));
  on('combat:impact', e => {
    if (Math.abs(e.s - game.runner.z) > 40) return;
    if (e.kind === 'shove') sfx.slap(e.dir, e.local ? 1 : .4);
    else if (e.local) sfx.noise(.05, .12, 650);
  });
  on('runner:jump', () => sfx.jump());
  on('runner:land', ({ impact }) => sfx.step(impact > 0.3));
  on('runner:step', () => sfx.step(false));
  on('runner:boost', ({ big }) => sfx.boost(big));
  on('runner:hit', () => sfx.crash());
  on('runner:nearMiss', () => { sfx.tone(520, 0.16, 'triangle', 0.1, 700); sfx.noise(0.12, 0.06, 3200); });
  on('runner:fall', () => sfx.tone(600, 0.8, 'sawtooth', 0.12, -500));
  on('runner:drift', ({ on: d }) => sfx.skid(d));
  on('runner:manual', ({ on: m }) => { if (m) sfx.tone(880, 0.12, 'square', 0.1, -300); });
  on('coins', ({ amount }) => { if (amount <= 2) sfx.coin(); });
  on('zone', () => sfx.zone());
  on('world:soon', ({ seconds }) => sfx.tone(seconds === 1 ? 880 : 660, 0.12, 'triangle', 0.1));
  on('weapon:equip', () => { sfx.pickup(); sfx.tone(440, 0.3, 'sawtooth', 0.08, 440); });
  on('weapon:fire', () => sfx.tone(1400, 0.05, 'square', 0.04, -900));
  on('weapon:expire', () => sfx.tone(500, 0.25, 'triangle', 0.1, -300));
  on('effect:add', () => sfx.pickup());
  on('pad:used', () => sfx.tone(980, 0.07, 'square', 0.05, 400));
  on('enemy:damage', ({ entity }) => { if (entity.kind === 'boss') sfx.tone(200, 0.08, 'square', 0.08, -100); });
  on('boss:start', () => [196, 185, 175, 165].forEach((f, i) => setTimeout(() => sfx.tone(f, 0.3, 'sawtooth', 0.15), i * 180)));
  on('boss:defeated', () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sfx.tone(f, 0.2, 'square', 0.14), i * 110)));
  on('game:over', () => { sfx.over(); sfx.skid(false); });
  on('state', ({ state }) => { if (state !== 'playing') sfx.skid(false); });
}
