import { Enemy } from './Enemy.js';

// Boss : reste devant le dino pendant l'arène, attaque selon sa phase, et
// s'enfuit s'il est encore en vie à la fin de l'arène (pas de récompense).
//
// def : { hp, reward, distance (m devant le dino), height,
//         phases: [{ below: 1, attackEvery: s, pattern: 'aimed' | 'spread' | ... }], projectile }
// Pour un boss sur mesure : sous-classer et surcharger attack(pattern) / update().
export class Boss extends Enemy {
  static kind = 'boss';

  constructor(game, def, opts) {
    super(game, def, { y: def.height ?? 4, ...opts });
    this.phaseIndex = 0;
    this.cooldown = 1.5;
    this.arenaEnd = opts.arenaEnd;
  }

  get phase() { return this.def.phases[this.phaseIndex]; }
  get hpRatio() { return Math.max(0, this.hp / this.maxHp); }

  update(dt) {
    super.update(dt);
    const r = this.runner;
    // flotte devant le dino et se balance de gauche à droite
    this.s = r.z + (this.def.distance ?? 30);
    this.d = Math.sin(this.t * 0.9) * (this.def.sway ?? 3);

    // phase suivante quand la vie passe sous un seuil
    const next = this.def.phases[this.phaseIndex + 1];
    if (next && this.hpRatio <= next.below) {
      this.phaseIndex++;
      this.game.emit('boss:phase', { boss: this, phase: this.phaseIndex });
    }

    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = this.phase.attackEvery;
      this.attack(this.phase.pattern);
    }

    if (r.z > this.arenaEnd) {
      this.game.emit('boss:escaped', { boss: this });
      this.destroy('escaped');
    }
  }

  attack(pattern) {
    const g = this.game, r = this.runner;
    const shoot = (d) => g.spawn(this.def.projectile, this.s - 2, d, { owner: 'enemy', vs: r.speed * 0.35 });
    if (pattern === 'aimed') shoot(r.x);
    else if (pattern === 'spread') for (const off of [-3.5, 0, 3.5]) shoot(r.x + off);
    else if (pattern === 'wall') {
      const hole = g.rng.range(-3, 3);
      for (let d = -6; d <= 6; d += 2.4) if (Math.abs(d - hole) > 2) shoot(d);
    }
    g.emit('boss:attack', { boss: this, pattern });
  }

  // Le boss ne blesse pas au contact (il est devant), il se bat à distance
  onContact() {}

  takeDamage(amount, source, reason) {
    super.takeDamage(amount, source, reason);
    this.game.emit('boss:damage', { boss: this, hp: Math.max(0, this.hp), max: this.maxHp });
  }

  onDeath() { this.game.emit('boss:defeated', { boss: this, reward: this.reward }); }
}
