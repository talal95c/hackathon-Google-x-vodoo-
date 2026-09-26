import { MusicThemes } from '../../kernel/Registry.js';
import { BeatTracker } from './BeatTracker.js';

const OFFSET_KEY = 'dino-escape-audio-offset';
const MIN_CONFIDENCE = 2.5; // bruit sans rythme ≈ 2.2 max, Lyria rythmé ≈ 3 à 5

// Relie le jeu à la musique :
// - choisit le thème du loadout, calcule une intensité (0 → 1) : vitesse, progression, danger, boss ;
// - SYNCHRO : impose le tempo à l'horloge du jeu (game.beat) et la recale sur la musique
//   via une boucle à verrouillage de phase (petites corrections successives) :
//     synthé → heures exactes de ses kicks ;
//     Lyria  → BeatTracker sur le PCM reçu (tempo réel + phase, précis à ~10 ms).
// Utilise Lyria s'il est connecté, sinon le synthé de secours.
export class MusicDirector {
  intensity = 0;
  tempoAdjust = 0;   // correction de tempo apprise (Lyria ne tient pas toujours le BPM demandé)
  lockKicks = 4;     // premiers kicks après un (re)démarrage : correction forte pour s'accrocher
  offsetMs = 0;      // réglage manuel de synchro (latence casque/Bluetooth…)

  constructor(game, { lyria, synth }) {
    this.game = game;
    this.lyria = lyria;
    this.synth = synth;
    this.engine = null;
    game.on('game:start', ({ loadout }) => this.play(MusicThemes.get(loadout.theme || 'techno')));
    game.on('game:over', () => setTimeout(() => { if (this.game.state === 'over') this.stop(); }, 1500));
    // si Lyria se connecte en pleine partie, on bascule dessus
    lyria.onStatus((status) => { if (status === 'ready' && this.engine === synth && this.theme) this.play(this.theme); });
    this.tracker = new BeatTracker();
    lyria.onPcm = (samples, rate, t) => this.tracker.analyze(samples, rate, t);
    lyria.onRestart = () => { this.lockKicks = 4; this.tracker.reset(); };
    synth.onKick = (t) => { if (this.engine === synth) this.#sync(t, 1); };
    try { this.offsetMs = +localStorage.getItem(OFFSET_KEY) || 0; } catch { /* */ }
  }

  setAudioContext(ctx) {
    this.ctx = ctx;
    this.lyria.setAudioContext(ctx);
    this.synth.setAudioContext(ctx);
  }

  setOffset(ms) {
    this.offsetMs = ms;
    try { localStorage.setItem(OFFSET_KEY, String(ms)); } catch { /* */ }
  }

  // Un kick sera entendu à l'heure audio `t` : aligne l'horloge du jeu dessus
  #sync(t, gain, trusted = false) {
    const clock = this.game.beat, now = this.ctx.currentTime;
    const heard = t + (this.ctx.outputLatency || 0) + this.offsetMs / 1000;
    const expected = clock.beats + clock.beatsIn(heard - now);
    const err = expected - Math.round(expected);      // > 0 : l'horloge est en avance
    const locking = this.lockKicks > 0;
    if (!locking && !trusted && Math.abs(err) > 0.3) return; // coup isolé à contretemps : ignoré
    if (locking) this.lockKicks--;
    clock.nudge(-err * (locking ? 0.8 : gain));
  }

  // Toutes les 0,5 s : estime tempo + phase sur l'audio déjà joué, recale l'horloge
  #trackLyria(dt) {
    this.trackTimer = (this.trackTimer ?? 0) - dt;
    if (this.trackTimer > 0) return;
    this.trackTimer = 0.5;
    const now = this.ctx.currentTime;
    const est = this.tracker.estimate(this.lyria.bpm, { until: now });
    this.lastEstimate = est;
    if (!est || est.confidence < MIN_CONFIDENCE) return;
    this.tempoAdjust += (est.bpm / this.lyria.bpm - 1 - this.tempoAdjust) * 0.5;
    const p = 60 / est.bpm;
    this.#sync(est.beatTime + Math.round((now - est.beatTime) / p) * p, 0.35, true); // estimation globale : fiable
  }

  async play(theme) {
    this.stop();
    this.theme = theme;
    this.tempoAdjust = 0;
    this.lockKicks = 4;
    this.tracker.reset();
    this.engine = this.lyria.ready ? this.lyria : this.synth;
    const ok = await this.engine.start(theme);
    if (this.engine === this.lyria && ok === false) { this.engine = this.synth; this.synth.start(theme); }
  }

  stop() { this.engine?.stop(); this.engine = null; }

  update(dt) {
    const g = this.game, r = g.runner, S = r.stats;
    if (this.engine) {
      g.beat.setBpm(this.engine.bpm * (1 + (this.engine === this.lyria ? this.tempoAdjust : 0)));
      if (this.engine === this.lyria && this.lyria.status === 'playing') this.#trackLyria(dt);
    }
    if (g.state !== 'playing' && g.state !== 'falling') return;
    const base = S.get('baseSpeed'), top = S.get('maxBaseSpeed') + S.get('boostSpeed') * 0.5;
    const speed = Math.max(0, Math.min(1, (r.speed - base) / (top - base)));
    const progress = Math.min(1, g.sMax / 5000);
    let target = 0.15 + progress * 0.45 + speed * 0.3 + g.chaser.danger(g.sMax) * 0.15;
    if (g.boss) target = Math.max(target, 0.9);
    this.intensity += (Math.min(1, target) - this.intensity) * Math.min(1, dt * 0.5);
    this.engine?.setIntensity(this.intensity);
  }
}
