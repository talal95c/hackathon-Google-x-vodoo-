import { GAME, RUNNER, TRACK } from './config.js';
import { WORLD_JUMP } from './WorldJourney.js';
import { EventBus } from './EventBus.js';
import { Random } from './Random.js';
import { Entities } from './Registry.js';
import { Track } from './Track.js';
import { Runner } from './Runner.js';
import { Chaser } from './Chaser.js';
import { Director } from './Director.js';
import { BeatClock } from './BeatClock.js';
import { ZONES } from '../content/zones.js';
import { CHALLENGES } from '../content/challenges.js';

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
    this.rng = new Random(seed ?? 1);        // apparitions, comportements
    this.trackRng = new Random(seed ?? 1);   // forme de la route : flux séparé → même graine = même route,
    this.track = new Track(this.bus, this.trackRng); // quel que soit l'ordre génération / apparitions
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
  get challenge() { return CHALLENGES.find((c) => c.id === this.loadout.challenge); }
  get challengeProgress() { return this.challenge ? Math.min(this.challenge.target, this[this.challenge.metric]) : 0; }

  // Palier de tempo à la distance s → { level, ratio }
  tempoAt(s) {
    const L = GAME.tempoLevels;
    let i = 0;
    while (i + 1 < L.length && s >= L[i + 1].at) i++;
    return { level: i, ratio: L[i].ratio };
  }

  // loadout : { seed?, modifiers?: [{source, add, mul}], skin?, theme? } (préparé par meta/)
  start(loadout = {}) {
    this.loadout = loadout;
    this.#resetWorld(loadout.seed ?? (Math.random() * 2 ** 32) >>> 0, loadout.modifiers);
    this.#setState('playing');
    this.emit('game:start', { loadout, seed: this.seed });
    this.emit('zone', { index: 0, number: 0, zone: this.zone });
    this.emit('tempo', this.tempo);
  }

  #resetWorld(seed, modifiers = []) {
    this.seed = seed;
    this.rng.seed(seed);
    this.trackRng.seed(`route-${seed}`);
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
    this.tempo = this.tempoAt(0);
    this.acc = 0;
    this.pendingJump = false;
    this.pendingAttack = false;
    this.parryCooldown = 0;
    this.parries = 0;
    this.nearMisses = 0;
    this.timeWarp = { left: 0, scale: 1 };
    this.fever = 0;
    this.feverTime = 0;
    this.fall = null;
    this.worldJump = null;
    this.nextWorld = 1;
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

  addFever(n) {
    if (this.state !== 'playing' || this.feverTime > 0) return;
    this.fever = Math.min(100, this.fever + n);
    if (this.fever >= 100) {
      this.fever = 0;
      this.feverTime = GAME.feverDuration;
      this.emit('fever:start', { seconds: this.feverTime });
    }
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
  // wallDt : temps réel écoulé (non plafonné), pour la durée des ralentis
  update(dt, intent, wallDt = dt) {
    this.beat.update(Math.min(dt, 0.25)); // l'horloge musicale tourne en temps réel, même au menu
    if (intent.jump) this.pendingJump = true;
    if (intent.attack && this.state === 'playing') this.pendingAttack = true;
    if (this.state !== 'playing' && this.state !== 'falling') return;
    const real = Math.min(dt, 0.25);
    const scale = this.timeWarp.left > 0 ? this.timeWarp.scale : 1;
    this.timeWarp.left = Math.max(0, this.timeWarp.left - wallDt);
    this.acc += real * scale;
    let n = 0;
    while (this.acc >= GAME.fixedDt && n < GAME.maxSubSteps) {
      this.#step(GAME.fixedDt, { ...intent, jump: this.pendingJump });
      this.pendingJump = false;
      this.pendingAttack = false;
      this.acc -= GAME.fixedDt;
      n++;
    }
    if (n === GAME.maxSubSteps) this.acc = 0;
  }

  #step(h, intent) {
    if (this.state === 'falling') return this.#stepFall(h);
    if (this.state !== 'playing') return;
    const r = this.runner, S = r.stats, f = this._f || (this._f = {});
    this.parryCooldown = Math.max(0, this.parryCooldown - h);
    if (this.feverTime > 0) {
      this.feverTime = Math.max(0, this.feverTime - h);
      if (this.feverTime === 0) this.emit('fever:end', {});
    }

    const tempo = this.tempoAt(this.sMax);
    if (tempo.level !== this.tempo.level) { this.tempo = tempo; this.emit('tempo', tempo); }
    r.cruise = S.get('baseSpeed') * this.tempo.ratio;
    while (!this.worldJump && this.nextWorld < ZONES.length && r.z > this.nextWorld * TRACK.zoneLength + WORLD_JUMP.tail) this.nextWorld++;
    const boundary = this.nextWorld * TRACK.zoneLength;
    if (!this.worldJump && this.nextWorld < ZONES.length && r.z >= boundary - WORLD_JUMP.lead) {
      this.worldJump = { from: this.zoneIndex, to: this.nextWorld, start: boundary - WORLD_JUMP.lead, end: boundary + WORLD_JUMP.tail, x: r.x, y: Math.max(0, r.y), progress: 0 };
      r.drifting = false; r.manual = false; r.stumble = 0; r.latV = 0; r.push = 0;
      this.emit('world:jump', { from: this.zone, to: ZONES[this.nextWorld] });
      this.nextWorld++;
    }
    if (this.worldJump) return this.#stepWorldJump(h);
    this.track.frame(r.z, f);
    r.update(h, intent, { y: f.y, vy: f.slope * r.speed, slope: f.slope, k: f.k, hard: !!this.track.hardTurnAt(r.z) });
    this.track.frame(r.z, f);
    if (r.grounded) { r.Y = f.y; r.y = 0; }
    this.sMax = Math.max(this.sMax, r.z);
    if (this.pendingAttack && this.parryCooldown <= 0) this.#parry();

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
      if (e.alive && e.kind === 'enemy') this.#trackNearMiss(e, r);
      if (e.alive && e.kind !== 'boss' && e.s < r.z - 40) e.destroy('despawn');
    }
    this.entities = list.filter((e) => e.alive);

    this.chaser.update(h, this.sMax, r.cruise);
    if (this.chaser.gap(this.sMax) <= 0) return this.#gameOver('caught');

    this.director.update(h);
    this.track.update(r.z);
  }

  #parry() {
    const r = this.runner;
    this.parryCooldown = GAME.parryCooldown;
    const reach = Math.max(4, r.speed * GAME.parryWindow);
    const target = this.entities.filter((e) => e.alive && e.def.parryable
      && e.s - r.z >= -0.6 && e.s - r.z <= reach
      && Math.abs(e.d - r.x) < e.hitbox.hx + r.stats.get('radius')).sort((a, b) => a.s - b.s)[0];
    if (!target) { this.emit('runner:parry:miss', {}); return; }
    target.takeDamage(Infinity, r, 'smashed');
    this.parries++;
    this.addFever(25);
    this.slow(GAME.parryHitstop, 0.05);
    this.emit('runner:parry', { entity: target, total: this.parries });
  }

  // Plus petit écart entre le dino et l'obstacle pendant qu'ils se croisent ; un obstacle
  // dépassé de justesse sans le toucher déclenche un bref ralenti et remplit la Frénésie.
  #trackNearMiss(e, r) {
    const h = e.hitbox;
    if (e.nearMissDone) return;
    if (Math.abs(r.z - e.s) < h.hz + 0.6) {
      const margin = Math.max(
        Math.abs(r.x - e.d) - (h.hx + RUNNER.radius * 0.8),
        r.y - (e.y + h.top - 0.3),
        e.y + h.bottom - (r.y + RUNNER.height),
      );
      e.closest = Math.min(e.closest ?? Infinity, margin);
      return;
    }
    if (e.s > r.z || e.closest === undefined) return;
    e.nearMissDone = true;
    if (r.isInvulnerable || e.closest < 0 || e.closest > GAME.nearMissMargin) return;
    this.nearMisses++;
    this.addFever(GAME.nearMissFever);
    this.slow(GAME.nearMissSlowMo, GAME.nearMissTimeScale);
    this.emit('runner:nearMiss', { entity: e, margin: e.closest, total: this.nearMisses });
  }

  // Ralentit la simulation pendant `seconds` de temps réel (hitstop, ralenti).
  slow(seconds, scale) {
    if (this.timeWarp.left > 0 && this.timeWarp.scale < scale) return;
    this.timeWarp = { left: seconds, scale };
  }

  #stepWorldJump(h) {
    const jump = this.worldJump, r = this.runner;
    r.speed += (Math.max(36, r.cruise) - r.speed) * Math.min(1, h * 4);
    r.z = Math.min(jump.end, r.z + r.speed * h);
    const p = jump.progress = Math.max(0, Math.min(1, (r.z - jump.start) / (jump.end - jump.start)));
    const f = this.track.frame(r.z, this._f || (this._f = {}));
    const previousY = r.Y;
    r.x = jump.x * (1 - p) ** 3;
    r.y = Math.sin(p * Math.PI) * WORLD_JUMP.height + jump.y * (1 - p);
    r.Y = f.y + r.y;
    r.vy = (r.Y - previousY) / h;
    r.grounded = false; r.steer = 0; r.gait += h * r.speed * .42;
    this.sMax = Math.max(this.sMax, r.z);
    const index = Track.zoneIndex(r.z);
    if (index !== this.zoneIndex) {
      this.zoneIndex = index;
      this.emit('zone', { index, number: index, zone: this.zone });
    }
    this.chaser.update(h, this.sMax, r.cruise);
    this.track.update(r.z);
    // The short cinematic pauses obstacles, power-ups and damage. Input resumes
    // only once the dino is safely on the destination road.
    if (p >= 1) {
      r.grounded = true; r.y = 0; r.Y = f.y; r.vy = f.slope * r.speed;
      r.prevRoadVy = r.vy; r.coyote = 0; r.jumpBuf = 0; r.invul = Math.max(r.invul, .6);
      this.worldJump = null;
      this.emit('world:land', { zone: this.zone });
      this.emit('runner:land', { impact: .45 });
    }
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
    const challenge = this.challenge && { id: this.challenge.id, progress: this.challengeProgress, complete: this.challengeProgress >= this.challenge.target };
    this.#setState('over');
    this.emit('game:over', { reason, distance: this.distance, coins: this.coins, score: this.score, zone: Track.zoneNumber(this.sMax), challenge });
  }

  #despawnChunk(chunk) {
    for (const e of this.entities) if (e.chunk === chunk.index) e.destroy('despawn');
  }
}
