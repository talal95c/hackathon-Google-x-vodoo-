import * as THREE from 'three';
import { View } from './View.js';
import { ZONES } from '../content/zones.js';
import { PICKUP_COLORS } from './models/entities.js';

// Particules (pool de petits cubes) déclenchées par les événements du jeu.
export class Particles extends View {
  pool = [];
  next = 0;
  #p = {};

  constructor(ctx, size = 260) {
    super(ctx);
    this.focus = ctx.focus;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < size; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false; this.scene.add(m);
      this.pool.push({ m, vx: 0, vy: 0, vz: 0, life: 0, max: 1, floor: 0 });
    }
    const edge = () => this.game.zone.palette.edge;
    const at = (e, h = 1) => this.track.point(e.s, e.d, e.y + h, this.#p);
    const P = this.focus;
    this.listen('world:jump', ({ to }) => { this.emit(P.x, P.y + 1, P.z, 0xffffff, 30, 16, 14, .3, 1); this.emit(P.x, P.y + 1, P.z, to.palette.edge, 30, 14, 12, .35, 1.1); });
    this.listen('world:land', () => { this.emit(P.x, P.y + .3, P.z, edge(), 40, 20, 10, .3, 1); this.emit(P.x, P.y + .3, P.z, 0xffffff, 20, 26, 6, .22, .7); });
    this.listen('runner:land', () => this.emit(P.x, P.y + 0.2, P.z, edge(), 6, 6, 3, 0.25, 0.4));
    this.listen('runner:hit', () => this.emit(P.x, P.y + 1, P.z, edge(), 12, 12, 9, 0.22, 0.7));
    this.listen('weapon:fire', () => this.emit(P.x, P.y + 2.6, P.z, 0xff1744, 2, 3, 2, 0.15, 0.2));
    this.listen('pad:used', ({ entity: e }) => {
      for (const side of [-1.5, 1.5]) { const q = this.track.point(e.s, e.d + side, 0.3, this.#p); this.emit(q.x, q.y, q.z, 0x3ddc84, 6, 4, 7, 0.22, 0.45); }
    });
    this.listen('entity:destroy', ({ entity: e, reason }) => {
      if (reason === 'collected') {
        if (e.type === 'coin') {
          const q = at(e, 1.25);
          this.emit(q.x, q.y, q.z, 0xfbbc04, 7, 7, 7, 0.22, 0.4);
          this.emit(q.x, q.y, q.z, 0xfff6d5, 3, 5, 9, 0.14, 0.5);
        } else {
          const q = at(e, 1.9), c = PICKUP_COLORS[e.type] ?? 0xffffff;
          this.emit(q.x, q.y, q.z, c, 18, 12, 10, 0.3, 0.6);
          this.emit(q.x, q.y, q.z, 0xffffff, 8, 8, 12, 0.18, 0.5);
        }
      }
      else if (reason === 'killed' || reason === 'smashed') { const q = at(e); this.emit(q.x, q.y, q.z, edge(), 14, 14, 10, 0.3, 0.8); }
      else if (reason === 'hit' && e.kind === 'projectile') { const q = at(e, 0); this.emit(q.x, q.y, q.z, 0xff8a80, 4, 5, 4, 0.15, 0.3); }
    });
  }

  emit(x, y, z, color, n, spread, up, size = 0.3, life = 0.6) {
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.next++ % this.pool.length];
      p.m.position.set(x, y, z); p.m.visible = true; p.floor = y - 0.3;
      p.m.material.color.setHex(color);
      p.m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      p.vx = (Math.random() - 0.5) * spread; p.vz = (Math.random() - 0.5) * spread; p.vy = Math.random() * up;
      p.life = p.max = life * (0.6 + Math.random() * 0.8);
    }
  }

  update(dt) {
    const edge = () => this.game.zone.palette.edge;
    const g = this.game, r = g.runner, P = this.focus;
    if (g.state === 'playing') {
      const f = this.track.frame(r.z, this.#p), h = f.th, fx = Math.sin(h), fz = Math.cos(h);
      if (r.drifting) {
        const col = r.driftCharge > 1 ? 0xff9800 : r.driftCharge > 0.35 ? 0x42a5f5 : 0xbbbbbb;
        for (const s of [-1, 1]) this.emit(P.x - fx * 0.5 + fz * s * 0.4, P.y + 0.2, P.z - fz * 0.5 - fx * s * 0.4, col, 1, 2, 2, 0.35, 0.4);
      }
      // poussière aux pieds : plus dense et plus haute avec la vitesse
      const spd = Math.max(0, Math.min(1, (r.speed - 20) / 42));
      if (r.grounded && !r.drifting && Math.random() < spd * dt * 40) {
        this.emit(P.x - fx * 0.7, P.y + 0.15, P.z - fz * 0.7, edge(), 1, 1.5 + spd * 3, 1 + spd * 2, 0.16 + spd * 0.14, 0.3 + spd * 0.2);
      }
      if (r.boost > 0) this.emit(P.x - fx * 1.5, P.y + 1 + Math.random() * 2.5, P.z - fz * 1.5, 0xffffff, 1, 1, 0, 0.18, 0.25);
      // Saut entre deux mondes : traînée de comète aux couleurs du monde d'arrivée
      if (g.worldJump) {
        const to = ZONES[g.worldJump.to].palette.edge;
        this.emit(P.x - fx * 1.2, P.y + 1.2 + Math.random() * 1.5, P.z - fz * 1.2, Math.random() < .5 ? 0xffffff : to, 2, 3, 2, 0.3, 0.5);
      }
    }
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.vy -= 12 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y = Math.max(p.floor, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      p.m.material.opacity = p.life / p.max;
    }
  }
}
