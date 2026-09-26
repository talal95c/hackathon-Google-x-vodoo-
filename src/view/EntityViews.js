import * as THREE from 'three';
import { View } from './View.js';
import { Models } from './ModelRegistry.js';

// Un visuel par entité du kernel, créé via le registre de modèles (clé = entity.type).
// Placement automatique sur la route (s, d, y) ; animations de disparition selon la raison.
export class EntityViews extends View {
  views = new Map();
  dying = [];
  #f = {};

  constructor(ctx) {
    super(ctx);
    this.listen('entity:spawn', (e) => this.#create(e));
    this.listen('entity:destroy', ({ entity, reason }) => this.#destroy(entity, reason));
    for (const e of this.game.entities) this.#create(e);
  }

  #create(e) {
    const model = Models.create(e.type, { entity: e });
    const holder = new THREE.Group();
    holder.rotation.order = 'YXZ';
    holder.add(model.object);
    this.scene.add(holder);
    const v = { e, model, holder };
    this.views.set(e.id, v);
    this.#place(v);
  }

  #place({ e, holder }) {
    const f = this.track.frame(e.s, this.#f);
    holder.position.set(f.x + f.lx * e.d, f.y + e.y, f.z + f.lz * e.d);
    holder.rotation.y = f.th;
    holder.rotation.x = -Math.atan(f.slope);
  }

  #destroy(e, reason) {
    const v = this.views.get(e.id);
    if (!v) return;
    this.views.delete(e.id);
    const r = this.game.runner;
    if (reason === 'collected') this.dying.push({ v, t: 0, dur: 0.18, kind: 'pop' });
    else if (reason === 'escaped') this.dying.push({ v, t: 0, dur: 1.5, kind: 'escape' });
    else if (e.kind !== 'projectile' && (reason === 'killed' || reason === 'smashed' || reason === 'hit')) {
      this.dying.push({ v, t: 0, dur: 1.6, kind: 'fly', vel: new THREE.Vector3((Math.random() - 0.5) * 10, 12, 0), fwd: r.speed * 0.9 });
    } else this.#dispose(v);
  }

  #dispose(v) {
    this.scene.remove(v.holder);
    v.model.dispose?.();
  }

  update(dt, time) {
    for (const v of this.views.values()) {
      this.#place(v);
      v.model.update?.(v.e, dt, time);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i], h = d.v.holder;
      d.t += dt;
      const k = d.t / d.dur;
      if (d.kind === 'pop') h.scale.setScalar(1 + k * 1.5);
      else if (d.kind === 'escape') { h.position.y += dt * 25; h.rotation.z += dt * 2; }
      else {
        d.vel.y -= 30 * dt;
        const fx = Math.sin(h.rotation.y), fz = Math.cos(h.rotation.y);
        h.position.x += (d.vel.x + fx * d.fwd) * dt; h.position.y += d.vel.y * dt; h.position.z += fz * d.fwd * dt;
        h.rotation.x += dt * 6; h.rotation.z += dt * 4;
      }
      if (k >= 1) { this.#dispose(d.v); this.dying.splice(i, 1); }
    }
  }
}
