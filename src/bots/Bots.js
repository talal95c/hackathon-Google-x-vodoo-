import { bumpImpulse, shoveTarget, FIGHT } from '../net/rules.js';
import { RUNNER } from '../kernel/config.js';

// PNJ du mode solo : des dinos IA qui courent avec le joueur, esquivent les obstacles, sautent
// ceux qui sont bas… et viennent chercher la bagarre (bousculades, coups d'épaule).
// Mêmes règles de combat que le multijoueur (net/rules.js). Aucune dépendance graphique :
// RivalView les affiche comme des rivaux (interface rivals()).
const NAMES = ['Rex', 'Trixie', 'Ptéra', 'Dino404', 'Bronto', 'Raptor', 'Spino', 'Diplo'];
const COLORS = ['#ff6d00', '#a142f4', '#00bcd4', '#e53935', '#43a047', '#fdd835'];
const SKINS = ['classic', 'neon', 'gold'];

export class Bots {
  list = [];
  active = false;

  constructor(game, count = 3) {
    this.game = game;
    this.count = count;
    game.on('game:over', () => { this.active = false; });
  }

  // Au départ d'une partie solo : PNJ sur les lignes voisines du joueur
  start(skins = SKINS) {
    const g = this.game, r = g.runner, rng = g.rng;
    this.list = Array.from({ length: this.count }, (_, i) => ({
      id: `bot${i}`, name: NAMES[(i * 3 + (g.seed % NAMES.length)) % NAMES.length], color: COLORS[i % COLORS.length],
      skin: skins[i % skins.length],
      s: r.z - 2 - i * 1.5, d: [-2.8, 2.8, -5.2, 5.2][i % 4], y: 0, vy: 0, speed: RUNNER.startSpeed, latV: 0, knockV: 0,
      stumble: 0, shoveCd: 2 + rng.range(0, 2), bumpCd: 0, alive: true, fall: 0, shoveAnim: 0, shoveDir: 1,
      pace: rng.range(0.93, 1.04),            // plus ou moins rapide
      aggression: rng.range(0.35, 0.8),       // envie de se battre
      lane: rng.range(-2.5, 2.5),
    }));
    this.active = true;
  }

  stop() { this.active = false; this.list = []; }

  // Interface commune avec le multijoueur (RivalView, classement)
  rivals() {
    return this.list.map((b) => ({ id: b.id, name: b.name, skin: b.skin, color: b.color, alive: b.alive,
      view: { s: b.s, d: b.d, y: b.y, v: b.speed, lat: b.latV + b.knockV, st: b.alive ? 'playing' : b.fall > 0 ? 'falling' : 'over',
        sh: b.shoveAnim > 0 ? 1 : 0, shd: b.shoveDir, hit: b.stumble > 0 ? 1 : 0 } }));
  }

  ranking() {
    const g = this.game;
    const rows = [{ id: 'me', name: 'Toi', color: '#1a73e8', me: true, alive: g.state === 'playing' || g.state === 'falling', dist: g.distance }];
    for (const b of this.list) rows.push({ id: b.id, name: b.name, color: b.color, alive: b.alive, dist: Math.floor(b.s) });
    return rows.sort((a, b) => (b.alive - a.alive) || b.dist - a.dist);
  }

  update(dt, intent) {
    if (!this.active) return;
    const g = this.game;
    if (g.state !== 'playing') return;
    const r = g.runner, track = g.track, f = {};
    const me = { s: r.z, d: r.x, y: r.y, lat: r.latV + r.push };

    for (const b of this.list) {
      if (!b.alive) { if (b.fall > 0) { b.fall -= dt; b.y -= 25 * dt; } continue; }
      track.frame(b.s, f);
      b.stumble = Math.max(0, b.stumble - dt);
      b.shoveCd -= dt; b.bumpCd -= dt; b.shoveAnim = Math.max(0, b.shoveAnim - dt);

      // vitesse : suit le rythme de la course, reste à portée du joueur pour se battre
      const gap = r.z - b.s;
      let target = r.cruise * b.pace + Math.max(-8, Math.min(8, gap * 0.35));
      if (b.stumble > 0) target *= 0.6;
      b.speed += (target - b.speed) * Math.min(1, dt * 2.5);

      // où aller : sa ligne… ou le joueur s'il a envie d'en découdre
      // où aller : sa ligne… ou À CÔTÉ du joueur s'il a envie d'en découdre (jamais pile devant :
      // il cacherait le joueur à la caméra) ; il ne se rapproche que juste avant son coup d'épaule
      let want = b.lane;
      const near = Math.abs(gap) < 14;
      if (near && b.aggression > 0.3) {
        const side = Math.sign(b.d - r.x) || (b.id.charCodeAt(3) % 2 ? 1 : -1);
        want = r.x + side * (b.shoveCd < 0.7 ? 1.7 : 3);
      }
      // esquive / saut des obstacles devant
      for (const e of g.entities) {
        if (!e.alive || e.kind !== 'enemy') continue;
        const ahead = e.s - b.s;
        if (ahead < 0 || ahead > 26) continue;
        if (Math.abs(e.d - b.d) > e.hitbox.hx + 1.3) continue;
        if (e.hitbox.top < 2.6 && ahead < 8 && ahead > 3 && b.y <= 0) b.vy = RUNNER.jumpVel; // obstacle bas : saut
        else if (e.hitbox.top >= 2.6) want = e.d > b.d ? e.d - e.hitbox.hx - 2.2 : e.d + e.hitbox.hx + 2.2; // haut : esquive
      }
      const half = f.w / 2 - 1.2;
      want = Math.max(-half, Math.min(half, want));
      const latMax = RUNNER.latSpeed + b.speed * 0.12;
      // comme le joueur : un dino qui trébuche ne dirige plus (c'est là qu'on peut l'éjecter)
      if (b.stumble <= 0) b.latV += (Math.max(-latMax, Math.min(latMax, (want - b.d) * 3)) - b.latV) * Math.min(1, dt * 10);
      b.knockV *= Math.exp(-dt * RUNNER.knockDecay);

      // saut / gravité
      if (b.y > 0 || b.vy > 0) { b.vy -= RUNNER.gravity * (b.vy < 0 ? RUNNER.fallGravity : 1) * dt; b.y = Math.max(0, b.y + b.vy * dt); if (b.y === 0) b.vy = 0; }

      b.d += (b.latV + b.knockV) * dt;
      b.s += b.speed * dt;

      // obstacles percutés : trébuche
      for (const e of g.entities) {
        if (!e.alive || e.kind !== 'enemy' || Math.abs(e.s - b.s) > e.hitbox.hz + 0.6 || Math.abs(e.d - b.d) > e.hitbox.hx + RUNNER.radius) continue;
        if (b.y < e.y + e.hitbox.top - 0.3 && b.stumble <= 0) { b.stumble = RUNNER.stumbleTime; b.speed *= 0.65; }
      }

      // coup d'épaule sur le joueur (ou un autre PNJ) à portée
      if (b.shoveCd <= 0 && near && b.stumble <= 0) {
        const targets = [{ id: 'me', s: r.z, d: r.x, alive: true }, ...this.list.filter((o) => o !== b && o.alive).map((o) => ({ id: o.id, s: o.s, d: o.d, alive: true }))];
        const t = shoveTarget(b, targets);
        if (t && Math.random() < b.aggression) {
          b.shoveAnim = 0.35; b.shoveDir = t.dir;
          if (t.id === 'me') { if (!r.isInvulnerable) { r.knock(t.dir * FIGHT.shovePower, { stumble: FIGHT.shoveStumble, source: 'bot' }); g.emit('mp:shoved', { from: b.name }); } }
          else { const o = this.list.find((x) => x.id === t.id); o.knockV += t.dir * FIGHT.shovePower; o.latV = 0; o.stumble = FIGHT.shoveStumble; }
          g.emit('bot:shove', { bot: b.name });
        }
        b.shoveCd = 2.5 + Math.random() * 2;
      }

      // sorti de la route (poussé !) → éliminé
      if (b.y <= 0 && Math.abs(b.d) > f.w / 2 + 0.4) this.#eliminate(b, 'fall');
    }

    // contacts : joueur ↔ PNJ et PNJ ↔ PNJ (règles du multijoueur, calculées localement)
    for (const b of this.list) {
      if (!b.alive || b.bumpCd > 0) continue;
      const bot = { s: b.s, d: b.d, y: b.y, lat: b.latV + b.knockV };
      const onMe = bumpImpulse(me, bot, 1);
      if (onMe && g.state === 'playing') {
        r.knock(onMe, { source: 'bump' });
        b.knockV += bumpImpulse(bot, me, -1);
        b.bumpCd = FIGHT.bumpCooldown;
        g.emit('mp:bump', {});
      }
      for (const o of this.list) {
        if (o === b || !o.alive || o.bumpCd > 0) continue;
        const other = { s: o.s, d: o.d, y: o.y, lat: o.latV + o.knockV }, imp = bumpImpulse(bot, other, b.id < o.id ? 1 : -1);
        if (imp) { b.knockV += imp; o.knockV += bumpImpulse(other, bot, b.id < o.id ? -1 : 1); b.bumpCd = o.bumpCd = FIGHT.bumpCooldown; }
      }
    }

    // coup d'épaule du joueur sur un PNJ
    if (intent?.shove && (this.shoveCd ?? 0) <= 0) {
      this.shoveCd = FIGHT.shoveCooldown;
      const t = shoveTarget(me, this.list.filter((b) => b.alive).map((b) => ({ id: b.id, s: b.s, d: b.d, alive: true })));
      if (t) { const b = this.list.find((x) => x.id === t.id); b.knockV += t.dir * FIGHT.shovePower; b.latV = 0; b.stumble = FIGHT.shoveStumble; }
      g.emit('mp:shove', { hit: !!t, dir: t ? t.dir : (Math.sign(r.latV) || 1) });
    }
    this.shoveCd = Math.max(0, (this.shoveCd ?? 0) - dt);
  }

  get shoveCooldown() { return (this.shoveCd ?? 0) / FIGHT.shoveCooldown; }

  #eliminate(b, reason) {
    b.alive = false;
    b.fall = reason === 'fall' ? 1.5 : 0;
    this.game.emit('bot:out', { bot: b.name, reason });
  }
}
