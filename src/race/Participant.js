import { ROYALE } from '../kernel/config.js';
import { FLAGS } from './RaceCore.js';

const IDLE = { steer: 0, drift: false, brake: false, jump: false };

// Un dino en course : relie un Game local (mode 'royale') à l'autorité de la course (RaceCore),
// qu'elle soit sur le serveur ou dans le navigateur. Sert au joueur humain ET aux bots.
//
//   const p = new Participant({ game, id, send: (msg) => ..., clock: () => heureDuServeurMs });
//   p.handle(msgDuCore);
//   p.update(dt, { steer, drift, brake, jump, item, shove });
//
// Réémet sur le bus du jeu des événements 'race:*' pour la HUD et les vues :
//   race:countdown, race:start, race:standings, race:item, race:use, race:combo, race:fx,
//   race:hit, race:impulse, race:shoveHit, race:feed, race:emote, race:elim, race:end, race:bump, race:rocket
export class Participant {
  constructor({ game, id, name = 'Dino', skin = 'classic', send, clock = () => Date.now() }) {
    Object.assign(this, { game, id, name, skin, send, clock });
    this.rivals = new Map();
    this.phase = 'idle';           // idle → countdown → racing → out (éliminé, spectateur) → done
    this.item = null; this.itemRoll = 0;
    this.combo = { level: 0, shoveMul: 1, until: 0 };
    this.standings = []; this.schedule = []; this.results = null;
    this.snapAcc = 0; this.bumpCd = 0;
    this.lastJumpAt = -Infinity;
    this.renderDelay = 0.12;
    this.offs = [];
    const on = (t, fn) => this.offs.push(game.on(t, fn));
    on('itembox:collect', () => { if (this.racing) this.send({ t: 'box' }); });
    on('runner:fall', () => { if (this.racing) this.send({ t: 'fell' }); });
    on('trap:hit', ({ owner }) => { if (this.racing) this.send({ t: 'trapHit', owner }); });
    on('runner:boost', ({ source, big }) => {
      if (!this.racing) return;
      if (source === 'drift' && big) this.send({ t: 'drift' });
      if (source === 'trick') this.send({ t: 'trick' });
    });
  }

  get racing() { return this.phase === 'racing'; }
  get raceTime() { return (this.clock() - this.startAt) / 1000; }
  get place() { const i = this.standings.indexOf(this.id); return i < 0 ? 0 : i + 1; }
  get aliveCount() { return this.standings.length; }
  get nextElimIn() { const n = this.schedule.find((s) => s > this.raceTime); return n === undefined ? null : n - this.raceTime; }

  emit(type, payload) { this.game.emit(type, payload); }

  handle(msg) {
    const g = this.game;
    switch (msg.t) {
      case 'race:start': {
        Object.assign(this, { seed: msg.seed, startAt: msg.startAt, schedule: msg.schedule, phase: 'countdown', results: null, item: null });
        this.combo = { level: 0, shoveMul: 1, until: 0 };
        this.rivals.clear();
        for (const p of msg.players) {
          if (p.id === this.id) { this.color = p.color; continue; }
          this.rivals.set(p.id, { ...p, alive: true, buf: [] });
        }
        this.standings = msg.players.map((p) => p.id);
        return this.emit('race:countdown', { startAt: msg.startAt, players: msg.players });
      }
      case 'snaps':
        for (const [id, z, x, y, sp, st, f] of msg.list) {
          const r = this.rivals.get(id);
          if (!r) continue;
          r.buf.push({ ts: msg.ts, z, x, y, sp, st, f });
          if (r.buf.length > 40) r.buf.shift();
        }
        return;
      case 'standings':
        this.standings = msg.order;
        return this.emit('race:standings', msg);
      case 'item':
        this.item = msg.item; this.itemRoll = msg.roll ?? 0;
        return this.emit('race:item', msg);
      case 'combo':
        this.combo = { ...msg, until: this.raceTime + (msg.window ?? 0) };
        if (g.state === 'playing') {
          if (msg.boost > 0) g.runner.addBoost(msg.boost, 'combo');
          if (msg.rage) g.runner.addEffect('rage');
        }
        return this.emit('race:combo', msg);
      case 'impulse':
        g.applyImpulse(msg.dx);
        return this.emit('race:impulse', msg);
      case 'hit': {
        const res = g.applyHit(msg.kind, msg);
        this.send({ t: 'hitres', from: msg.from, kind: msg.kind, res });
        return this.emit('race:hit', { ...msg, res });
      }
      case 'trap':
        if (g.state === 'playing') g.spawn('trapTab', msg.s, msg.d, { owner: msg.owner });
        return;
      case 'elim': {
        const me = msg.id === this.id;
        if (me) { this.phase = 'out'; g.endRace({ reason: 'eliminated', place: msg.place }); }
        else if (this.rivals.has(msg.id)) this.rivals.get(msg.id).alive = false;
        this.standings = this.standings.filter((id) => id !== msg.id);
        return this.emit('race:elim', { ...msg, me, state: me ? null : this.rivalState(msg.id) });
      }
      case 'race:end': {
        this.results = msg;
        const mine = msg.results.find((r) => r.id === this.id);
        if (this.phase === 'racing') g.endRace({ reason: mine?.place === 1 ? 'won' : 'finished', place: mine?.place });
        this.phase = 'done';
        return this.emit('race:end', msg);
      }
      case 'fx': case 'feed': case 'emote': case 'shoveHit':
        return this.emit(`race:${msg.t}`, msg);
    }
  }

  // intent : celui de Input (+ item, shove : -1|0|1 en front montant)
  update(dt, intent = IDLE) {
    const g = this.game;
    if (this.phase === 'countdown') {
      if (intent.jump) this.lastJumpAt = this.clock();
      if (this.clock() >= this.startAt) this.#go();
      else { g.update(dt, IDLE); return; }
    }
    if (this.phase !== 'racing') { g.update(dt, this.phase === 'idle' ? IDLE : intent); return; }

    this.itemRoll = Math.max(0, this.itemRoll - dt);
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    if (g.state === 'playing') this.#contacts();
    g.update(dt, intent);
    if (intent.item) this.useItem();
    if (intent.shove) this.shove(intent.shove);
    if (this.combo.level > 0 && this.raceTime > this.combo.until) this.combo = { level: 0, shoveMul: 1, until: 0 };

    this.snapAcc += dt;
    if (this.snapAcc >= 1 / ROYALE.snapshotRate) {
      this.snapAcc = 0;
      this.send(this.snapshot());
    }
  }

  #go() {
    const g = this.game, R = ROYALE.rocket;
    g.start({ mode: 'royale', seed: this.seed, skin: this.skin, theme: this.theme ?? 'techno', modifiers: [] });
    g.playerId = this.id;
    // Grille de départ : chacun sur sa ligne, dans l'ordre d'inscription
    const n = this.standings.length, i = Math.max(0, this.standings.indexOf(this.id));
    g.runner.x = (i - (n - 1) / 2) * 2.4;
    this.phase = 'racing';
    // Départ turbo : sauter juste avant le « GO »
    const early = (this.startAt - this.lastJumpAt) / 1000;
    if (early >= 0 && early <= R.window) { g.runner.addBoost(R.boost, 'rocket'); this.emit('race:rocket', { ok: true }); }
    else if (early > R.stallBefore && early < ROYALE.countdown + 1) { g.runner.speed *= R.stallSpeed; g.runner.stumble = 0.6; this.emit('race:rocket', { ok: false }); }
    this.emit('race:start', { seed: this.seed });
  }

  snapshot() {
    const g = this.game, r = g.runner;
    let f = 0;
    if (r.drifting) f |= FLAGS.drift;
    if (r.smashes || r.autopilot > 0) f |= FLAGS.shield;
    if (r.boost > 0) f |= FLAGS.boost;
    if (g.state === 'falling') f |= FLAGS.fall;
    if (r.raging) f |= FLAGS.rage;
    if (r.stumble > 0) f |= FLAGS.stumble;
    const st = g.state === 'falling' ? 'fall' : r.stumble > 0 ? 'stumble' : !r.grounded ? 'jump' : r.drifting ? 'slide' : 'run';
    const q = (v) => Math.round(v * 100) / 100;
    return { t: 'snap', ts: q(this.raceTime), z: q(r.z), x: q(r.x), y: q(r.y), sp: q(r.speed), st, f };
  }

  // Contact physique local avec les rivaux (bousculade) + aspiration
  #contacts() {
    const r = this.game.runner, B = ROYALE.bump, S = ROYALE.slipstream;
    r.drafting = false;
    for (const rival of this.rivals.values()) {
      if (!rival.alive) continue;
      const s = this.rivalState(rival.id);
      if (!s || s.f & FLAGS.fall) continue;
      const dz = s.z - r.z, dx = r.x - s.x;
      if (Math.abs(dz) < B.length && Math.abs(dx) < B.radius && Math.abs(r.y - s.y) < 1.5) {
        const dir = Math.sign(dx) || (rival.id < this.id ? 1 : -1);
        const k = (1 - Math.abs(dx) / B.radius) * B.strength * (s.f & FLAGS.shield ? 2 : 1) * (r.smashes ? 0.4 : 1);
        if (dir * r.shoveV < k) r.shoveV = dir * k;
        if (this.bumpCd <= 0) { this.bumpCd = 0.4; this.emit('race:bump', { id: rival.id }); }
      }
      if (dz > S.min && dz < S.range && Math.abs(dx) < S.lateral) r.drafting = true;
    }
  }

  // État interpolé d'un rival (légèrement dans le passé pour lisser le réseau)
  rivalState(id) {
    const b = this.rivals.get(id)?.buf;
    if (!b?.length) return null;
    const ts = this.raceTime - this.renderDelay;
    for (let i = b.length - 1; i > 0; i--) {
      const a = b[i - 1], c = b[i];
      if (a.ts <= ts && ts <= c.ts) {
        const k = (ts - a.ts) / Math.max(1e-6, c.ts - a.ts);
        return { ...c, z: a.z + (c.z - a.z) * k, x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, sp: a.sp + (c.sp - a.sp) * k };
      }
    }
    const last = b[b.length - 1];
    if (ts < b[0].ts) return b[0];
    const ahead = Math.min(0.25, ts - last.ts); // extrapolation courte si un paquet manque
    return { ...last, z: last.z + last.sp * ahead };
  }

  useItem() {
    const g = this.game, r = g.runner, item = this.item;
    if (!item || this.itemRoll > 0 || !this.racing || g.state !== 'playing') return false;
    this.item = null;
    if (item === 'turbo') r.addBoost(2.2, 'item');
    else if (item === 'firewall') r.equip('shield');
    else if (item === 'express') r.autopilot = 3;
    else if (item === 'laser') r.equip('raceLaser');
    this.send({ t: 'use', item });
    this.emit('race:use', { item });
    return true;
  }

  shove(dir) {
    const g = this.game;
    if (!this.racing || g.state !== 'playing' || !g.runner.dash(dir)) return false;
    this.send({ t: 'shove', dir: Math.sign(dir), ts: Math.round(this.raceTime * 100) / 100 });
    return true;
  }

  emote(e) { this.send({ t: 'emote', e }); }

  dispose() { for (const off of this.offs) off(); this.offs = []; }
}
