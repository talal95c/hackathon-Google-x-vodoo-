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
    this.master.connect(this.ctx.destination);
    this.onInit?.(this.ctx);

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

  coin(step = 0, gold = false) {
    const freq = 660 * 2 ** (Math.min(step, 10) / 12);
    this.tone(freq, 0.09, 'triangle', gold ? 0.16 : 0.1, freq * 0.2);
  }
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
  let chain = 0, lastCoin = -Infinity;
  on('game:start', () => { chain = 0; lastCoin = -Infinity; });
  on('runner:jump', () => sfx.jump());
  on('runner:land', ({ impact }) => sfx.step(impact > 0.3));
  on('runner:step', () => sfx.step(false));
  on('runner:boost', ({ big }) => sfx.boost(big));
  on('runner:hit', () => sfx.crash());
  on('runner:fall', () => sfx.tone(600, 0.8, 'sawtooth', 0.12, -500));
  on('runner:drift', ({ on: d }) => sfx.skid(d));
  on('runner:manual', ({ on: m }) => { if (m) sfx.tone(880, 0.12, 'square', 0.1, -300); });
  on('entity:destroy', ({ entity, reason }) => {
    if (reason !== 'collected' || (entity.type !== 'coin' && entity.type !== 'goldCoin')) return;
    const now = performance.now();
    chain = now - lastCoin < 800 ? chain + 1 : 0;
    lastCoin = now;
    sfx.coin(chain, entity.type === 'goldCoin');
  });
  on('runner:parry', () => { sfx.tone(170, 0.18, 'sawtooth', 0.24, -100); sfx.noise(0.1, 0.18, 1800); });
  on('runner:nearMiss', () => { sfx.tone(520, 0.16, 'triangle', 0.1, 700); sfx.noise(0.12, 0.06, 3200); });
  on('runner:parry:miss', () => sfx.tone(220, 0.08, 'triangle', 0.06, -90));
  on('fever:start', () => { [440, 554, 659].forEach((f, i) => setTimeout(() => sfx.tone(f, 0.16, 'sawtooth', 0.12), i * 80)); });
  on('zone', () => sfx.zone());
  on('weapon:equip', () => sfx.tone(440, 0.3, 'sawtooth', 0.12, 440));
  on('weapon:fire', () => sfx.tone(1400, 0.05, 'square', 0.04, -900));
  on('weapon:expire', () => sfx.tone(500, 0.25, 'triangle', 0.1, -300));
  on('effect:add', () => sfx.tone(660, 0.25, 'triangle', 0.12, 660));
  on('enemy:damage', ({ entity }) => { if (entity.kind === 'boss') sfx.tone(200, 0.08, 'square', 0.08, -100); });
  on('boss:start', () => [196, 185, 175, 165].forEach((f, i) => setTimeout(() => sfx.tone(f, 0.3, 'sawtooth', 0.15), i * 180)));
  on('boss:defeated', () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sfx.tone(f, 0.2, 'square', 0.14), i * 110)));
  on('game:over', ({ reason }) => { if (reason === 'caught') sfx.click(); sfx.over(); sfx.skid(false); });
  on('state', ({ state }) => { if (state !== 'playing') sfx.skid(false); });
}
