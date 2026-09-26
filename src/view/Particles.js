import * as THREE from 'three';
import { View } from './View.js';

// Particules (pool de petits cubes) déclenchées par les événements du jeu.
export class Particles extends View {
  pool = [];
  next = 0;
  #p = {};

  constructor(ctx, size = 160) {
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
    this.listen('runner:land', () => this.emit(P.x, P.y + 0.2, P.z, edge(), 6, 6, 3, 0.25, 0.4));
    this.listen('runner:hit', () => this.emit(P.x, P.y + 1, P.z, edge(), 12, 12, 9, 0.22, 0.7));
    this.listen('weapon:fire', () => this.emit(P.x, P.y + 2.6, P.z, 0xff1744, 2, 3, 2, 0.15, 0.2));
    this.listen('entity:destroy', ({ entity: e, reason }) => {
      if (reason === 'collected') { const q = at(e, 1.2); this.emit(q.x, q.y, q.z, e.type === 'coin' ? 0xfbbc04 : 0xffffff, 6, 6, 6, 0.25, 0.4); }
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
    const g = this.game, r = g.runner, P = this.focus;
    if (g.state === 'playing') {
      const f = this.track.frame(r.z, this.#p), h = f.th, fx = Math.sin(h), fz = Math.cos(h);
      if (r.drifting) {
        const col = r.driftCharge > 1 ? 0xff9800 : r.driftCharge > 0.35 ? 0x42a5f5 : 0xbbbbbb;
        for (const s of [-1, 1]) this.emit(P.x - fx * 0.5 + fz * s * 0.4, P.y + 0.2, P.z - fz * 0.5 - fx * s * 0.4, col, 1, 2, 2, 0.35, 0.4);
      }
      if (r.boost > 0) this.emit(P.x - fx * 1.5, P.y + 1 + Math.random() * 2.5, P.z - fz * 1.5, 0xffffff, 1, 1, 0, 0.18, 0.25);
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
