import { DIRECTOR, TRACK, GAME, RUNNER } from './config.js';
import { Entities } from './Registry.js';
import { ZONES } from '../content/zones.js';
import { Track } from './Track.js';

// Le Director décide QUOI apparaît et QUAND : tables de spawn pondérées par zone,
// difficulté croissante, arène de boss en fin de zone (si la zone en a un)… et RYTHME :
// les apparitions sont espacées en temps musicaux, puis aimantées pour que le dino
// les atteigne pile sur un temps (snapToBeat), même si sa vitesse change.
//
// Table de spawn d'une zone (content/zones.js) :
//   spawns: [
//     { type: 'cactus', weight: 3 },
//     { type: 'laserPickup', weight: 0.3, minDistance: 400 },
//     { pattern: 'coinRow', weight: 2, count: 5 },
//   ]
// Pour un nouveau motif (ex. "slalom"), ajouter une méthode dans PATTERNS.
export class Director {
  constructor(game) { this.game = game; }

  reset() {
    this.boss = null;
    this.bossZone = -1;
    this._lastArenaSlot = null;
  }

  get bossActive() { return !!this.boss?.alive; }

  arenaStart(s) { return Track.zoneNumber(s) * TRACK.zoneLength + DIRECTOR.bossStart; }
  arenaEnd(s) { return (Track.zoneNumber(s) + 1) * TRACK.zoneLength; }

  // Appelé à la création de chaque morceau de route
  populate(chunk) {
    const g = this.game, r = g.rng, zone = ZONES[chunk.zone];
    const diff = Math.min(1, chunk.s0 / 4000);
    const arena = zone.boss ? this.arenaStart(chunk.s0) : Infinity;
    const f = {};
    let s = Math.max(chunk.s0, DIRECTOR.firstSpawn) + r.range(4, 14);
    while (s < chunk.s1 - 4) {
      const W = g.track.frame(s, f).w;
      if (s >= arena) {
        // Arène : pas d'obstacles (le boss s'en charge), des armes et des pièces
        const k = Math.floor((s - arena) / DIRECTOR.arenaWeaponEvery);
        if (k !== this._lastArenaSlot) { this._lastArenaSlot = k; g.spawn(r.pick(zone.bossWeapons || ['laserPickup']), s, r.range(-W / 4, W / 4), { chunk: chunk.index }); }
        else PATTERNS.coinRow(g, chunk, s, W, { count: 4 });
        s += 30;
        continue;
      }
      const beat = this.beatLength(s);
      const entry = this.#pick(zone.spawns, s);
      s += entry.pattern ? PATTERNS[entry.pattern](g, chunk, s, W, { ...entry, spacing: Math.max(2.2, beat / 2) }) : this.#spawnOne(entry.type, chunk, s, W);
      s += beat * r.pick(r.chance(diff) ? DIRECTOR.gapBeatsHard : DIRECTOR.gapBeatsEasy);
    }
  }

  // Distance parcourue pendant un temps musical, à la vitesse de croisière prévue en s
  beatLength(s) {
    const cruise = RUNNER.baseSpeed + (RUNNER.maxBaseSpeed - RUNNER.baseSpeed) * Math.min(1, s / GAME.difficultyDistance);
    return cruise * this.game.beat.period;
  }

  // Aimante les entités proches pour que leur arrivée tombe sur un temps (def.snap = subdivision,
  // 1 = temps, 2 = croches ; false = jamais). Les groupes (rangées de pièces) bougent ensemble.
  snapToBeat(h) {
    const g = this.game, r = g.runner, clock = g.beat;
    const [near, far] = DIRECTOR.snapWindow, maxStep = DIRECTOR.snapRate * h;
    const speed = Math.max(8, r.speed);
    for (const e of g.entities) {
      if (!e.alive || e.def.snap === false || e.kind === 'projectile' || e.kind === 'boss') continue;
      if (e.snapGroup && e.snapGroup[0] !== e) continue; // seul le meneur du groupe calcule
      const ahead = e.s - r.z;
      if (ahead < near || ahead > far) continue;
      // temps d'arrivée actuel → temps d'arrivée sur la subdivision la plus proche
      const eta = ahead / speed;
      const target = r.z + clock.snapDelay(eta, e.def.snap ?? 1) * speed;
      const delta = target - e.s;
      const step = Math.max(-maxStep, Math.min(maxStep, delta));
      if (e.snapGroup) { for (const m of e.snapGroup) m.s += step; }
      else e.s += step;
    }
  }

  #pick(table, s) {
    const options = table.filter((e) => !e.minDistance || s >= e.minDistance);
    const total = options.reduce((a, e) => a + e.weight, 0);
    let x = this.game.rng.next() * total;
    for (const e of options) if ((x -= e.weight) <= 0) return e;
    return options[options.length - 1];
  }

  #spawnOne(type, chunk, s, W) {
    const hx = Entities.get(type).hitbox?.hx ?? 1;
    const maxD = Math.max(0, W / 2 - hx - 0.3);
    this.game.spawn(type, s, this.game.rng.range(-maxD, maxD), { chunk: chunk.index });
    return 0;
  }

  // Déclenche le boss quand le dino entre dans l'arène
  update() {
    const g = this.game, s = g.runner.z, n = Track.zoneNumber(s), zone = ZONES[Track.zoneIndex(s)];
    if (!zone.boss || this.bossZone === n || s < this.arenaStart(s)) return;
    this.bossZone = n;
    this.boss = g.spawn(zone.boss, s + 30, 0, { arenaEnd: this.arenaEnd(s) });
    g.emit('boss:start', { boss: this.boss });
  }
}

// Motifs de spawn : renvoient la longueur de route "consommée" en plus
const PATTERNS = {
  coinRow(g, chunk, s, W, { count = 5, type = 'coin', spacing = 2.6 } = {}) {
    const d = g.rng.range(-W / 2 + 1.5, W / 2 - 1.5), group = [];
    for (let k = 0; k < count; k++) group.push(g.spawn(type, s + k * spacing, d, { chunk: chunk.index, snapGroup: group }));
    return count * spacing;
  },
  // Rangée de pièces qui serpente (suit une sinusoïde)
  coinSnake(g, chunk, s, W, { count = 8, type = 'coin', spacing = 3 } = {}) {
    const amp = W / 2 - 2, ph = g.rng.range(0, 6), group = [];
    for (let k = 0; k < count; k++) group.push(g.spawn(type, s + k * spacing, Math.sin(ph + k * 0.5) * amp, { chunk: chunk.index, snapGroup: group }));
    return count * spacing;
  },
};
