import { Entity } from './Entity.js';

// Ennemi : blesse le dino au contact, sauf si le dino est invulnérable (clignote)
// ou armé d'une arme qui "écrase" (bouclier). Peut être détruit par les armes.
export class Enemy extends Entity {
  static kind = 'enemy';

  constructor(game, def, opts) {
    super(game, def, opts);
    this.maxHp = this.hp = def.hp ?? 1;
    this.damage = def.damage ?? 1;
    this.reward = def.reward ?? 0;       // pièces gagnées si on le détruit
  }

  onContact(runner) {
    if (runner.smashes) return this.takeDamage(Infinity, runner, 'smashed');
    if (runner.isInvulnerable) return;
    if (runner.hurt(this)) this.destroy('hit');
  }

  takeDamage(amount, source, reason = 'killed') {
    if (!this.alive) return;
    this.hp -= amount;
    this.game.emit('enemy:damage', { entity: this, amount, hp: Math.max(0, this.hp) });
    if (this.hp <= 0) {
      if (this.reward) this.game.addCoins(this.reward);
      this.onDeath(source);
      this.destroy(reason);
    }
  }

  onDeath(source) {}
}

// Obstacle statique classique (cactus, pop-up, bandeau cookies…)
export class Obstacle extends Enemy {}

// Ennemi qui bouge. Mouvement par défaut piloté par def.motion :
//   { lateral: amplitude, freq }   → oscille de gauche à droite (reste sur la route)
//   { roll: vitesse, wake: m }     → fonce vers le dino (s diminue) quand il est à moins de `wake` m
//   { fly: hauteur }               → vole à cette hauteur (hitbox relative à y)
// Pour un comportement sur mesure : sous-classer et surcharger update().
export class MovingEnemy extends Enemy {
  constructor(game, def, opts) {
    super(game, def, opts);
    this.d0 = this.d;
    this.phase = game.rng.range(0, Math.PI * 2);
    if (def.motion?.fly) this.y = def.motion.fly;
  }

  get charging() { return !!this.def.motion?.roll && this.s - this.runner.z < (this.def.motion.wake ?? 80); }

  update(dt) {
    super.update(dt);
    const m = this.def.motion || {};
    if (m.lateral) {
      const half = this.game.track.frame(this.s, this._f || (this._f = {})).w / 2 - this.hitbox.hx - 0.3;
      this.d = Math.max(-half, Math.min(half, this.d0 + Math.sin(this.t * (m.freq ?? 1.5) + this.phase) * m.lateral));
    }
    // ne fonce que quand le dino approche (sinon il partirait avant d'être vu)
    if (this.charging) this.s -= m.roll * dt;
  }
}
