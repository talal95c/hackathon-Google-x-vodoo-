import { GAME } from './config.js';
import { EventBus } from './EventBus.js';
import { Random } from './Random.js';
import { Entities } from './Registry.js';
import { Track } from './Track.js';
import { Runner } from './Runner.js';
import { Chaser } from './Chaser.js';
import { Director } from './Director.js';
import { BeatClock } from './BeatClock.js';
import { ZONES } from '../content/zones.js';

// Chef d'orchestre de la partie. Aucune dépendance graphique / DOM.
//
//   const game = new Game();
//   game.on('runner:jump', () => ...);
//   game.start({ modifiers, skin, theme });
//   // chaque frame :
//   game.update(dt, { steer, drift, brake, jump });
//
// États : 'menu' → 'playing' ⇄ 'falling' → 'over'
// Voir ARCHITECTURE.md pour la liste des événements.
export class Game {
  constructor({ seed, bus } = {}) {
    this.bus = bus ?? new EventBus();
    this.rng = new Random(seed ?? 1);
    this.track = new Track(this.bus, this.rng);
    this.runner = new Runner(this);
    this.chaser = new Chaser();
    this.director = new Director(this);
    this.beat = new BeatClock(this.bus);
    this.track.populate = (chunk) => this.director.populate(chunk);
    this.bus.on('chunk:remove', (c) => this.#despawnChunk(c));
    this.state = 'menu';
    this.entities = [];
    this.loadout = {};
    this.#resetWorld(seed ?? 1);
  }

  on(type, fn) { return this.bus.on(type, fn); }
  emit(type, payload) { this.bus.emit(type, payload); }

  get distance() { return Math.floor(this.sMax); }
  get score() { return this.distance + this.coins * GAME.coinValue; }
  get zone() { return ZONES[this.zoneIndex]; }
  get boss() { return this.director.bossActive ? this.director.boss : null; }

  // loadout : { seed?, modifiers?: [{source, add, mul}], skin?, theme? } (préparé par meta/)
  start(loadout = {}) {
    this.loadout = loadout;
    this.#resetWorld(loadout.seed ?? (Math.random() * 2 ** 32) >>> 0, loadout.modifiers);
    this.#setState('playing');
    this.emit('game:start', { loadout, seed: this.seed });
    this.emit('zone', { index: 0, number: 0, zone: this.zone });
  }

  #resetWorld(seed, modifiers = []) {
    this.seed = seed;
    this.rng.seed(seed);
    for (const e of this.entities) e.destroy('despawn');
    this.entities = [];
    this.track.reset();
    this.director.reset();
    this.runner.reset(modifiers);
    this.runner.z = GAME.startS;
    const f = this.track.frame(this.runner.z, {});
    this.runner.Y = f.y;
    this.lives = this.runner.stats.get('maxLives');
    this.coins = 0;
    this.sMax = this.runner.z;
    this.zoneIndex = 0;
    this.acc = 0;
    this.pendingJump = false;
    this.fall = null;
    this.chaser.reset(this.sMax);
    this.track.update(this.runner.z);
  }

  #setState(state) {
    const prev = this.state;
    this.state = state;
    this.emit('state', { state, prev });
  }

  // --- API pour les entités / armes / Director
  spawn(type, s, d, opts = {}) {
    const def = Entities.get(type);
    const e = new def.class(this, def, { s, d, ...opts });
    this.entities.push(e);
    this.emit('entity:spawn', e);
    return e;
  }

  addCoins(n) {
    const amount = Math.round(n * this.runner.stats.get('coinMultiplier'));
    this.coins += amount;
    this.emit('coins', { amount, total: this.coins });
  }

  // Renvoie true si la partie est finie
  loseLife(reason) {
    this.lives = Math.max(0, this.lives - 1);
    this.emit('life:lost', { reason, lives: this.lives });
    if (this.lives > 0) return false;
    this.#gameOver(reason === 'fall' ? 'fall' : 'dead');
    return true;
  }

  // --- Boucle (pas fixe → physique identique quel que soit le FPS)
  update(dt, intent) {
    this.beat.update(Math.min(dt, 0.25)); // l'horloge musicale tourne en temps réel, même au menu
    if (intent.jump) this.pendingJump = true;
    if (this.state !== 'playing' && this.state !== 'falling') return;
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= GAME.fixedDt && n < GAME.maxSubSteps) {
      this.#step(GAME.fixedDt, { ...intent, jump: this.pendingJump });
      this.pendingJump = false;
      this.acc -= GAME.fixedDt;
      n++;
    }
    if (n === GAME.maxSubSteps) this.acc = 0;
  }

  #step(h, intent) {
    if (this.state === 'falling') return this.#stepFall(h);
    if (this.state !== 'playing') return;
    const r = this.runner, S = r.stats, f = this._f || (this._f = {});

    const progress = Math.min(1, this.sMax / GAME.difficultyDistance);
    r.cruise = S.get('baseSpeed') + (S.get('maxBaseSpeed') - S.get('baseSpeed')) * progress;
    this.track.frame(r.z, f);
    r.update(h, intent, { y: f.y, vy: f.slope * r.speed, slope: f.slope, k: f.k });
    this.track.frame(r.z, f);
    if (r.grounded) { r.Y = f.y; r.y = 0; }
    this.sMax = Math.max(this.sMax, r.z);

    const zi = Track.zoneIndex(r.z);
    if (zi !== this.zoneIndex) {
      this.zoneIndex = zi;
      this.emit('zone', { index: zi, number: Track.zoneNumber(r.z), zone: this.zone });
    }

    // Sorti de la route → chute
    if (r.grounded && Math.abs(r.x) > f.w / 2 + 0.4) return this.#startFall(f);

    // Entités : comportement + contact avec le dino
    const list = this.entities, n = list.length;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (!e.alive) continue;
      e.update(h);
      if (e.alive && Math.abs(e.s - r.z) < 12 && e.overlapsRunner(r)) e.onContact(r);
      if (this.state !== 'playing') return;
      if (e.alive && e.kind !== 'boss' && e.s < r.z - 40) e.destroy('despawn');
    }
    this.entities = list.filter((e) => e.alive);

    this.chaser.update(h, this.sMax, r.cruise);
    if (this.chaser.gap(this.sMax) <= 0) return this.#gameOver('caught');

    this.director.update(h);
    this.director.snapToBeat(h);
    this.track.update(r.z);
  }

  #startFall(f) {
    const r = this.runner;
    const lat = r.latV + r.push;
    this.fall = {
      t: 0,
      x: f.x + f.lx * r.x, y: r.Y, z: f.z + f.lz * r.x,
      vx: Math.sin(f.th) * r.speed + f.lx * lat, vy: r.vy, vz: Math.cos(f.th) * r.speed + f.lz * lat,
    };
    this.#setState('falling');
    this.emit('runner:fall', { fall: this.fall });
  }

  #stepFall(h) {
    const F = this.fall;
    F.t += h;
    F.vy -= 30 * h;
    F.x += F.vx * h; F.y += F.vy * h; F.z += F.vz * h;
    this.chaser.update(h, this.sMax, this.runner.cruise);
    if (F.t >= GAME.fallDuration) this.#gameOver('fall'); // tomber = fin de partie, quelles que soient les vies
  }

  #gameOver(reason) {
    if (this.state === 'over') return;
    this.#setState('over');
    this.emit('game:over', { reason, distance: this.distance, coins: this.coins, score: this.score, zone: Track.zoneNumber(this.sMax) });
  }

  #despawnChunk(chunk) {
    for (const e of this.entities) if (e.chunk === chunk.index) e.destroy('despawn');
  }
}
