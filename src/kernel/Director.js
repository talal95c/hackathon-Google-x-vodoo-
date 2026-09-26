import { DIRECTOR, TRACK } from './config.js';
import { Entities } from './Registry.js';
import { ZONES } from '../content/zones.js';
import { Track } from './Track.js';
import { isWorldSafe, intersectsWorldSafe } from './WorldJourney.js';

// Le Director décide QUOI apparaît et QUAND : tables de spawn pondérées par zone,
// difficulté croissante, et arène de boss en fin de zone (si la zone en a un).
// Le gameplay ne dépend pas de la musique (pas de latence possible) : seul le décor pulse au rythme.
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
    const gap = DIRECTOR.gapEasy + (DIRECTOR.gapHard - DIRECTOR.gapEasy) * diff;
    const arena = zone.boss && !g.royale ? this.arenaStart(chunk.s0) : Infinity;
    if (g.royale) this.#itemRows(chunk);
    const f = {};
    let s = Math.max(chunk.s0, DIRECTOR.firstSpawn) + r.range(4, 14);
    while (s < chunk.s1 - 4) {
      if (isWorldSafe(s) || isWorldSafe(s + 45)) { s += 12; continue; }
      const W = g.track.frame(s, f).w;
      if (s >= arena) {
        // Arène : pas d'obstacles (le boss s'en charge), des armes et des pièces
        const k = Math.floor((s - arena) / DIRECTOR.arenaWeaponEvery);
        if (k !== this._lastArenaSlot) { this._lastArenaSlot = k; g.spawn(r.pick(zone.bossWeapons || ['laserPickup']), s, r.range(-W / 4, W / 4), { chunk: chunk.index }); }
        else PATTERNS.coinRow(g, chunk, s, W, { count: 4 });
        s += 30;
        continue;
      }
      if (g.track.hardTurnAt(s, 25)) { s += 10; continue; } // rien dans les virages durs : le défi, c'est le virage
      const entry = this.#pick(zone.spawns, s);
      const span = entry.pattern ? (entry.count ?? 8) * (entry.spacing ?? 3) : 0;
      if (intersectsWorldSafe(s, s + span)) { s += 12; continue; }
      s += entry.pattern ? PATTERNS[entry.pattern](g, chunk, s, W, entry) : this.#spawnOne(entry.type, chunk, s, W);
      s += gap * r.range(0.7, 1.3);
    }
  }

  // Royale : rangées de boîtes « ? » à intervalles fixes (sans tirage aléatoire → identiques pour tous)
  #itemRows(chunk) {
    const g = this.game, every = DIRECTOR.itemRowEvery, f = {};
    for (let s = Math.ceil(Math.max(chunk.s0, DIRECTOR.firstSpawn) / every) * every; s < chunk.s1; s += every) {
      if (isWorldSafe(s) || g.track.hardTurnAt(s, 10)) continue;
      const W = g.track.frame(s, f).w, n = W > 13 ? 4 : 3;
      for (let k = 0; k < n; k++) g.spawn('itemBox', s, (k - (n - 1) / 2) * (W - 3) / n, { chunk: chunk.index });
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
    if (g.royale) return;
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
    for (let k = 0; k < count; k++) group.push(g.spawn(type, s + k * spacing, d, { chunk: chunk.index, group }));
    return count * spacing;
  },
  // Rangée de pièces qui serpente (suit une sinusoïde)
  coinSnake(g, chunk, s, W, { count = 8, type = 'coin', spacing = 3 } = {}) {
    const amp = W / 2 - 2, ph = g.rng.range(0, 6), group = [];
    for (let k = 0; k < count; k++) group.push(g.spawn(type, s + k * spacing, Math.sin(ph + k * 0.5) * amp, { chunk: chunk.index, group }));
    return count * spacing;
  },
};
