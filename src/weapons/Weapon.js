// Arme équipée pour une durée limitée (def.duration × stat weaponDuration).
// À surcharger : onEquip(), update(dt), onExpire(). Propriétés lues par le kernel :
//   smashes             → le dino détruit les ennemis au contact au lieu d'être blessé
//   grantsInvulnerability
export class Weapon {
  constructor(runner, def) {
    this.runner = runner;
    this.game = runner.game;
    this.def = def;
    this.type = def.id;
    this.duration = def.duration * runner.stats.get('weaponDuration');
    this.timeLeft = this.duration;
  }

  get smashes() { return false; }
  get grantsInvulnerability() { return false; }
  get progress() { return this.timeLeft / this.duration; } // 1 → 0

  onEquip() {}
  update(dt) { this.timeLeft -= dt; }
  onExpire() {}
}

// Tire automatiquement des projectiles droit devant
export class LaserWeapon extends Weapon {
  cooldown = 0;

  update(dt) {
    super.update(dt);
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = this.def.fireRate;
      const r = this.runner;
      this.game.spawn(this.def.projectile, r.z + 2, r.x, { owner: 'player', vs: r.speed + this.def.projectileSpeed, y: r.y + 1.6 });
      this.game.emit('weapon:fire', { weapon: this });
    }
  }
}

// Traverse les ennemis en les détruisant
export class ShieldWeapon extends Weapon {
  get smashes() { return true; }
}
