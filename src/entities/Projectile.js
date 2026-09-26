import { Entity } from './Entity.js';
import { Enemy } from './Enemy.js';

// Projectile : avance le long de la route (vs, en m/s absolus) et latéralement (vd).
// owner 'player' → touche les ennemis ; owner 'enemy' → blesse le dino au contact.
export class Projectile extends Entity {
  static kind = 'projectile';

  constructor(game, def, opts) {
    super(game, def, { y: 1.3, ...opts });
    this.owner ??= 'enemy';
    this.vs ??= def.speed ?? 40;
    this.vd ??= 0;
    this.damage = def.damage ?? 1;
    this.life = def.life ?? 3;
  }

  update(dt) {
    super.update(dt);
    this.s += this.vs * dt;
    this.d += this.vd * dt;
    if (this.t > this.life) return this.destroy('expired');
    if (this.owner === 'player') {
      for (const e of this.game.entities) {
        if (e.alive && e instanceof Enemy && this.overlaps(e)) {
          e.takeDamage(this.damage, this);
          return this.destroy('hit');
        }
      }
    }
  }

  onContact(runner) {
    if (this.owner !== 'enemy') return;
    if (runner.smashes) return this.destroy('smashed');
    if (runner.isInvulnerable) return;
    if (runner.hurt(this)) this.destroy('hit');
  }
}
