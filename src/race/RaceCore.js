import { ROYALE } from '../kernel/config.js';
import { Random } from '../kernel/Random.js';
import { eliminationSchedule, ITEMS, rollItem, comboEffect, COMBO_GAIN, coinReward, trophyDelta, PLAYER_COLORS } from './rules.js';

// Autorité de la Course Royale : horloge d'élimination, classement, combos, objets, poussées.
// Aucune dépendance au DOM ni au réseau : tourne sur le serveur (server/RaceRoom.js) ou dans
// le navigateur pour l'entraînement contre les bots (race/LocalHost.js).
//
//   const core = new RaceCore({ now: () => Date.now(), send: (to, msg) => ... }); // to = id | null (tous)
//   core.addPlayer({ id, name, skin, bot }); core.start({ seed });
//   core.onMessage(id, msg); core.tick(); // ~60 Hz
//
// Messages reçus (client → core) : snap, box, use, shove, fell, hitres, trapHit, drift, trick, emote
// Messages envoyés : race:start, snaps, standings, item, combo, impulse, shoveHit, fx, hit, trap,
//                    feed, emote, elim, race:end
export const FLAGS = { drift: 1, shield: 2, boost: 4, fall: 8, rage: 16, stumble: 32 };
const MAX_SPEED = 95; // m/s, au-delà un instantané est jugé impossible

export class RaceCore {
  constructor({ now = () => Date.now(), send = () => {}, onEnd = null, endTime = ROYALE.endTime, interval = ROYALE.interval } = {}) {
    Object.assign(this, { now, send, onEnd, endTime, interval });
    this.players = new Map();
    this.phase = 'lobby';     // lobby → countdown → racing → done
    this.rng = new Random(1);
    this.pending = [];        // attaques en vol : { at, target, from, kind }
    this.ahead = new Map();   // "a|b" → id de celui qui est devant (hystérésis des dépassements)
    this.lastSnaps = -1; this.lastStandings = -1;
    this.nextElim = 0;
    this.trapId = 0;
  }

  get raceTime() { return (this.now() - this.startAt) / 1000; }
  get alive() { return [...this.players.values()].filter((p) => p.alive); }

  addPlayer({ id, name = 'Dino', skin = 'classic', bot = false, elo, trophies } = {}) {
    if (this.phase !== 'lobby') return null;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
    const p = {
      id, name: String(name).slice(0, 16), skin, bot, elo, trophies, color,
      alive: true, connected: true, place: 0, snap: null, hist: [],
      item: null, lastBox: -9, lastShove: -9, lastEmote: -9, lastBonus: {},
      combo: { level: 0, until: 0, best: 0 }, shovedBy: null, suspicious: 0,
      stats: { overtakes: 0, shoves: 0, ringOuts: 0, hits: 0, points: 0, falls: 0 },
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby') this.players.delete(id);
    else p.connected = false; // éliminé en priorité au prochain passage du curseur
  }

  list() { return [...this.players.values()].map(({ id, name, color, skin, bot }) => ({ id, name, color, skin, bot })); }

  start({ seed = (Math.random() * 2 ** 32) >>> 0, countdown = ROYALE.countdown } = {}) {
    if (this.phase !== 'lobby') return;
    this.seed = seed;
    this.rng.seed(`items-${seed}`);
    this.startAt = this.now() + countdown * 1000;
    this.schedule = eliminationSchedule(this.players.size, { endTime: this.endTime, interval: this.interval });
    this.phase = 'countdown';
    this.send(null, { t: 'race:start', seed, startAt: this.startAt, schedule: this.schedule, players: this.list() });
  }

  // Classement des vivants (distance décroissante)
  standings() { return this.alive.sort((a, b) => (b.snap?.z ?? 0) - (a.snap?.z ?? 0)); }
  placeOf(p) { return this.standings().indexOf(p) + 1; }

  tick() {
    if (this.phase === 'countdown' && this.now() >= this.startAt) this.phase = 'racing';
    if (this.phase !== 'racing') return;
    const t = this.raceTime;

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const h = this.pending[i];
      if (t < h.at) continue;
      this.pending.splice(i, 1);
      const target = this.players.get(h.target);
      if (target?.alive) this.send(target.id, { t: 'hit', from: h.from, kind: h.kind, dodgeable: h.kind === 'laser' || h.kind === 'popup', slow: h.kind === 'lag' ? 0.55 : 1 });
    }

    for (const p of this.alive) {
      if (p.combo.level > 0 && t > p.combo.until) this.#breakCombo(p, 'timeout');
    }
    this.#overtakes();

    while (this.phase === 'racing' && this.nextElim < this.schedule.length && t >= this.schedule[this.nextElim]) {
      this.nextElim++;
      this.#eliminateLast();
    }
    if (this.phase === 'racing' && t > this.endTime + 20) this.#finish();
    if (this.phase !== 'racing') return;

    const snapSlot = Math.floor(t * ROYALE.snapshotRate);
    if (snapSlot !== this.lastSnaps) {
      this.lastSnaps = snapSlot;
      const list = [];
      for (const p of this.alive) if (p.snap) list.push([p.id, p.snap.z, p.snap.x, p.snap.y, p.snap.sp, p.snap.st, p.snap.f]);
      this.send(null, { t: 'snaps', ts: t, list });
    }
    const stSlot = Math.floor(t * 4);
    if (stSlot !== this.lastStandings) {
      this.lastStandings = stSlot;
      const order = this.standings().map((p) => p.id);
      this.send(null, { t: 'standings', order, next: this.schedule[this.nextElim] ?? null });
    }
  }

  onMessage(id, msg) {
    const p = this.players.get(id);
    if (!p || !msg || typeof msg.t !== 'string') return;
    if (msg.t === 'emote') {
      const t = this.phase === 'racing' ? this.raceTime : this.now() / 1000;
      if (t - p.lastEmote < 1.5) return;
      p.lastEmote = t;
      return this.send(null, { t: 'emote', id, e: msg.e | 0 });
    }
    if (this.phase !== 'racing' || !p.alive) return;
    const t = this.raceTime;
    switch (msg.t) {
      case 'snap': return this.#snap(p, msg, t);
      case 'box': {
        if (p.item || t - p.lastBox < 0.4) return;
        p.lastBox = t;
        return this.#grant(p, rollItem(this.placeOf(p), this.alive.length, () => this.rng.next()), 1);
      }
      case 'use': return this.#use(p, msg.item, t);
      case 'shove': return this.#shove(p, msg, t);
      case 'fell': {
        p.stats.falls++;
        this.#breakCombo(p, 'fall');
        const by = p.shovedBy && t - p.shovedBy.t < ROYALE.shove.ringOutWindow ? this.players.get(p.shovedBy.id) : null;
        p.shovedBy = null;
        if (by?.alive) {
          by.stats.ringOuts++;
          this.#addCombo(by, 'ringout', t);
          this.send(null, { t: 'feed', kind: 'ringout', a: by.id, b: p.id });
        }
        return;
      }
      case 'hitres': {
        if (msg.res !== 'hit') return;
        const from = this.players.get(msg.from);
        this.#breakCombo(p, 'hit');
        if (from && from !== p) {
          from.stats.hits++;
          if (from.alive) this.#addCombo(from, 'hit', t);
          this.send(null, { t: 'feed', kind: 'hit', item: msg.kind, a: from.id, b: p.id });
        }
        return;
      }
      case 'trapHit': {
        const owner = this.players.get(msg.owner);
        this.#breakCombo(p, 'hit');
        if (owner && owner !== p) {
          owner.stats.hits++;
          if (owner.alive) this.#addCombo(owner, 'hit', t);
          this.send(null, { t: 'feed', kind: 'hit', item: 'trap', a: owner.id, b: p.id });
        }
        return;
      }
      case 'drift': case 'trick': {
        if (t - (p.lastBonus[msg.t] ?? -9) < 1) return;
        p.lastBonus[msg.t] = t;
        return this.#addCombo(p, msg.t, t);
      }
    }
  }

  // --- Instantanés : position déclarée par le client, bornée par la vitesse max
  #snap(p, m, t) {
    const z = +m.z, x = +m.x;
    if (!Number.isFinite(z) || !Number.isFinite(x)) return;
    const ts = Number.isFinite(+m.ts) ? Math.min(+m.ts, t + 0.5) : t;
    const prev = p.snap;
    let zz = z;
    if (prev) {
      const dt = Math.max(0.05, ts - prev.ts);
      const maxZ = prev.z + MAX_SPEED * dt + 10;
      if (z > maxZ) { zz = maxZ; p.suspicious++; }
    }
    p.snap = { ts, z: zz, x, y: +m.y || 0, sp: +m.sp || 0, st: String(m.st ?? 'run').slice(0, 8), f: m.f | 0 };
    p.hist.push(p.snap);
    if (p.hist.length > 30) p.hist.shift();
  }

  // Position d'un joueur à l'instant ts (compensation de latence pour les poussées)
  stateAt(p, ts) {
    const h = p.hist;
    if (!h.length) return null;
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.ts <= ts && ts <= b.ts) {
        const k = (ts - a.ts) / Math.max(1e-6, b.ts - a.ts);
        return { z: a.z + (b.z - a.z) * k, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, f: b.f };
      }
    }
    return ts < h[0].ts ? h[0] : h[h.length - 1];
  }

  #overtakes() {
    const list = this.alive.filter((p) => p.snap && !(p.snap.f & FLAGS.fall));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j], key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const diff = a.snap.z - b.snap.z, prev = this.ahead.get(key);
        const now = diff > 1 ? a.id : diff < -1 ? b.id : prev;
        if (!now) continue;
        if (prev && now !== prev) {
          const passer = now === a.id ? a : b, passed = passer === a ? b : a;
          passer.stats.overtakes++;
          this.#addCombo(passer, 'overtake', this.raceTime, { passed: passed.id });
        }
        this.ahead.set(key, now);
      }
    }
  }

  #addCombo(p, kind, t, extra = {}) {
    const C = ROYALE.combo, prev = p.combo.level;
    const level = Math.min(C.maxLevel, prev + (COMBO_GAIN[kind] ?? 1));
    p.combo.level = level; p.combo.until = t + C.window; p.combo.best = Math.max(p.combo.best, level);
    p.stats.points += 10 * level;
    const fx = comboEffect(level, prev);
    this.send(p.id, { t: 'combo', kind, ...fx, window: C.window, ...extra });
    if (fx.freeItem && !p.item) this.#grant(p, rollItem(this.placeOf(p), this.alive.length, () => this.rng.next()), 1, 'combo');
    if (fx.rage) this.send(null, { t: 'feed', kind: 'rage', a: p.id });
  }

  #breakCombo(p, reason) {
    if (p.combo.level === 0) return;
    p.combo.level = 0;
    this.send(p.id, { t: 'combo', kind: 'break', reason, level: 0, boost: 0, shoveMul: 1, freeItem: false, rage: false });
  }

  #grant(p, item, roll = 0, source = 'box') {
    p.item = item;
    this.send(p.id, { t: 'item', item, roll, source });
  }

  #use(p, item, t) {
    if (!item || p.item !== item) return;
    p.item = null;
    const def = ITEMS[item];
    const others = this.alive.filter((q) => q !== p && q.snap);
    const me = p.snap ?? { z: 0, x: 0 };
    const fire = (target, eta) => {
      this.pending.push({ at: t + eta, target: target.id, from: p.id, kind: item });
      this.send(null, { t: 'fx', kind: item, from: p.id, target: target.id, eta });
    };
    switch (def.target) {
      case 'behind':
        return this.send(null, { t: 'trap', id: ++this.trapId, owner: p.id, s: me.z - 3, d: me.x });
      case 'ahead': {
        const q = others.filter((q) => q.snap.z > me.z && q.snap.z - me.z < def.range && Math.abs(q.snap.x - me.x) < 2.5).sort((a, b) => a.snap.z - b.snap.z)[0];
        return q ? fire(q, (q.snap.z - me.z) / def.speed) : this.send(null, { t: 'fx', kind: item, from: p.id, target: null });
      }
      case 'next': {
        const q = others.filter((q) => q.snap.z > me.z && q.snap.z - me.z < def.range).sort((a, b) => a.snap.z - b.snap.z)[0];
        return q ? fire(q, Math.max(0.6, (q.snap.z - me.z) / def.speed)) : this.send(null, { t: 'fx', kind: item, from: p.id, target: null });
      }
      case 'leader': {
        const leader = this.standings()[0];
        return leader && leader !== p ? fire(leader, def.eta) : this.send(null, { t: 'fx', kind: item, from: p.id, target: null });
      }
      case 'aheadAll':
        for (const q of others) if (q.snap.z > me.z) fire(q, 0.15);
        return;
      case 'steal': {
        const q = others.filter((q) => q.item).sort((a, b) => Math.abs(a.snap.z - me.z) - Math.abs(b.snap.z - me.z))[0];
        if (!q) return this.send(p.id, { t: 'item', item: null, source: 'copy' });
        const stolen = q.item;
        q.item = null;
        this.send(q.id, { t: 'item', item: null, source: 'stolen', by: p.id });
        this.#grant(p, stolen, 0, 'copy');
        return this.send(null, { t: 'feed', kind: 'steal', item: stolen, a: p.id, b: q.id });
      }
      default:
        return this.send(null, { t: 'fx', kind: item, from: p.id, target: p.id, self: true });
    }
  }

  // Coup d'épaule : touche le rival le plus proche du côté visé, à l'instant où le client a agi
  #shove(p, m, t) {
    const dir = Math.sign(+m.dir || 0);
    if (!dir || t - p.lastShove < ROYALE.shove.cooldown * 0.8) return;
    p.lastShove = t;
    const ts = Number.isFinite(+m.ts) ? Math.max(t - 0.5, Math.min(t, +m.ts)) : t;
    const me = this.stateAt(p, ts);
    if (!me) return;
    let best = null, bestD = Infinity;
    for (const q of this.alive) {
      if (q === p) continue;
      const s = this.stateAt(q, ts);
      if (!s || s.f & FLAGS.fall || Math.abs(s.z - me.z) > ROYALE.shove.reach || Math.abs(s.y - me.y) > 2) continue;
      const side = (s.x - me.x) * dir;
      if (side < -0.6 || side > ROYALE.shove.range) continue;
      if (side < bestD) { bestD = side; best = q; }
    }
    if (!best) return;
    const fx = comboEffect(p.combo.level, p.combo.level);
    const rage = !!(p.snap?.f & FLAGS.rage), shield = !!(p.snap?.f & FLAGS.shield);
    const dx = dir * ROYALE.shove.impulse * fx.shoveMul * (rage ? 1.6 : 1) * (shield ? 1.3 : 1);
    best.shovedBy = { id: p.id, t };
    p.stats.shoves++;
    this.send(best.id, { t: 'impulse', from: p.id, dx });
    this.send(p.id, { t: 'shoveHit', target: best.id });
    this.#addCombo(p, 'shove', t, { target: best.id });
  }

  #eliminateLast() {
    const alive = this.alive;
    if (alive.length <= 1) return this.#finish();
    const victim = alive.find((p) => !p.connected) ?? alive.sort((a, b) => (a.snap?.z ?? 0) - (b.snap?.z ?? 0))[0];
    victim.place = alive.length;
    victim.alive = false;
    victim.elimAt = this.raceTime;
    this.pending = this.pending.filter((h) => h.target !== victim.id);
    this.send(null, { t: 'elim', id: victim.id, place: victim.place, name: victim.name });
    if (alive.length - 1 <= 1) this.#finish();
  }

  #finish() {
    if (this.phase === 'done') return;
    const survivors = this.standings();
    survivors.forEach((p, i) => { p.place = i + 1; });
    this.phase = 'done';
    const n = this.players.size;
    const results = [...this.players.values()].sort((a, b) => a.place - b.place).map((p) => ({
      id: p.id, name: p.name, color: p.color, bot: p.bot, place: p.place,
      distance: Math.floor(p.snap?.z ?? 0), bestCombo: p.combo.best, stats: { ...p.stats },
      coins: coinReward(p.place, n), trophies: trophyDelta(p.place, n), suspicious: p.suspicious > 5,
    }));
    const done = (extra) => this.send(null, { t: 'race:end', results, ...(extra || {}) });
    const hook = this.onEnd?.(results);
    if (hook?.then) hook.then(done, () => done()); else done(hook);
  }
}
