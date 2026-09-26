import { Game } from '../kernel/Game.js';
import { Random } from '../kernel/Random.js';
import { Participant } from './Participant.js';

const BOT_NAMES = ['Byte', 'Pixel', 'Cache', 'Ping', 'Cookie', 'Proxy', 'Glitch', 'Kernel'];
export const botName = (i) => `${BOT_NAMES[i % BOT_NAMES.length]}🤖`;

// Adversaire piloté par le jeu : son propre Game headless (même graine que tout le monde)
// + une petite IA qui évite les obstacles, vise les boîtes, pousse et utilise ses objets.
// skill : 0 (distrait) → 1 (redoutable)
export class Bot {
  constructor({ id, name, send, clock, skill = 0.7, seed = 1 }) {
    this.game = new Game();
    this.p = new Participant({ game: this.game, id, name, send, clock });
    this.skill = skill;
    this.rng = new Random(`bot-${id}-${seed}`);
    this.lane = 0; this.laneT = 0; this.holdT = 0; this.decided = new Set();
  }

  get id() { return this.p.id; }
  handle(msg) { this.p.handle(msg); }
  update(dt) { this.p.update(dt, this.#think(dt)); }

  #think(dt) {
    const g = this.game, r = g.runner, p = this.p, rng = this.rng;
    const intent = { steer: 0, drift: false, brake: false, jump: false, item: false, shove: 0 };
    if (!p.racing || g.state !== 'playing') {
      if (p.phase === 'countdown' && p.startAt - p.clock() < 150 && rng.chance(this.skill * 0.1)) intent.jump = true;
      return intent;
    }
    const half = g.track.frame(r.z, this._f || (this._f = {})).w / 2 - 1.2;

    // Couloir visé : change de temps en temps, attiré par les boîtes quand l'emplacement est vide
    if ((this.laneT -= dt) <= 0) { this.lane = rng.range(-half * 0.6, half * 0.6); this.laneT = rng.range(1.5, 4); }
    let lane = this.lane;
    for (const e of g.entities) {
      const ahead = e.s - r.z;
      if (!e.alive || ahead < 0 || ahead > 32) continue;
      if (e.type === 'itemBox' && !p.item && ahead > 6) { lane = e.d; break; }
    }
    for (const e of g.entities) {
      const ahead = e.s - r.z;
      if (!e.alive || e.kind !== 'enemy' || ahead < 0 || ahead > 30) continue;
      if (Math.abs(e.d - r.x) > e.hitbox.hx + 1.4) continue;
      const jumpable = e.hitbox.top <= 2.6 && e.y < 0.5;
      if (!this.decided.has(e.id)) { this.decided.add(e.id); e._botSees = rng.chance(0.55 + this.skill * 0.45); }
      if (!e._botSees) continue;
      if (jumpable && ahead < r.speed * 0.3) intent.jump = true;
      else if (!jumpable) lane = e.d > 0 ? Math.max(-half, e.d - e.hitbox.hx - 2) : Math.min(half, e.d + e.hitbox.hx + 2);
      break;
    }
    if (this.decided.size > 200) this.decided.clear();

    const latMax = r.stats.get('latSpeed') + r.speed * 0.12;
    intent.steer = Math.max(-1, Math.min(1, ((lane - r.x) * 3 - r.push - r.shoveV) / latMax));

    // Poussée : rival collé sur le côté
    for (const rival of p.rivals.values()) {
      if (!rival.alive) continue;
      const s = p.rivalState(rival.id);
      if (!s) continue;
      const dx = s.x - r.x;
      if (Math.abs(s.z - r.z) < 2.5 && Math.abs(dx) < 3.5 && Math.abs(dx) > 0.3 && rng.chance(dt * 3 * this.skill)) { intent.shove = Math.sign(dx); break; }
    }

    // Objet : on le garde un peu puis on l'utilise
    if (p.item && p.itemRoll <= 0) {
      if ((this.holdT += dt) > 1 + (1 - this.skill) * 2) { intent.item = true; this.holdT = 0; }
    } else this.holdT = 0;
    return intent;
  }
}
