import { RUNNER } from '../kernel/config.js';

let nextId = 1;

// Classe de base de tout ce qui vit sur la route.
// Position en coordonnées piste : s (le long de la route), d (latéral, + = gauche),
// y (hauteur au-dessus de la route). hitbox : demi-largeur hx, demi-longueur hz,
// bas/haut (bottom/top) relatifs à y.
//
// À surcharger : update(dt), onContact(runner).
export class Entity {
  static kind = 'entity';

  constructor(game, def, { s, d = 0, y = 0, chunk = null, ...opts } = {}) {
    this.id = nextId++;
    this.game = game;
    this.def = def;
    this.type = def.id;
    this.kind = this.constructor.kind;
    this.s = s; this.d = d; this.y = y;
    this.chunk = chunk;                 // morceau de route propriétaire (null = persistant)
    this.persistent = chunk === null;
    this.hitbox = { hx: 1, hz: 1, bottom: 0, top: 2, ...def.hitbox };
    this.alive = true;
    this.t = 0;                         // temps écoulé depuis l'apparition
    Object.assign(this, opts);
  }

  get runner() { return this.game.runner; }

  update(dt) { this.t += dt; }

  // Collision avec le dino (le dino peut sauter par-dessus si top est bas)
  overlapsRunner(r = this.runner) {
    const h = this.hitbox;
    return Math.abs(r.z - this.s) < h.hz + 0.6
      && Math.abs(r.x - this.d) < h.hx + RUNNER.radius
      && r.y < this.y + h.top - 0.3
      && r.y + RUNNER.height > this.y + h.bottom;
  }

  // Collision entre deux entités (projectiles)
  overlaps(o) {
    return Math.abs(o.s - this.s) < o.hitbox.hz + this.hitbox.hz
      && Math.abs(o.d - this.d) < o.hitbox.hx + this.hitbox.hx;
  }

  onContact(runner) {}

  // reason : 'collected' | 'killed' | 'smashed' | 'hit' | 'despawn' | 'escaped' | 'expired'
  destroy(reason = 'despawn') {
    if (!this.alive) return;
    this.alive = false;
    this.game.emit('entity:destroy', { entity: this, reason });
  }
}
