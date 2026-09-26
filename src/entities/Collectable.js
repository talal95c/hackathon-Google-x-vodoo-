import { Entity } from './Entity.js';

// Objet à ramasser : au contact, collect() puis disparition.
export class Collectable extends Entity {
  static kind = 'collectable';

  onContact(runner) {
    this.collect(runner);
    this.destroy('collected');
  }

  collect(runner) {}
}

// Pièce : monnaie de la boutique. Attirée par l'aimant (stat magnetRange).
export class CoinPickup extends Collectable {
  update(dt) {
    super.update(dt);
    const r = this.runner, range = r.stats.get('magnetRange');
    if (range > 0) {
      const ds = r.z - this.s, dd = r.x - this.d;
      const dist = Math.hypot(ds, dd);
      if (dist < range && dist > 0.01) {
        const step = Math.min(dist, (r.speed + 25) * dt);
        this.s += (ds / dist) * step; this.d += (dd / dist) * step;
      }
    }
  }

  collect() { this.game.addCoins(this.def.value ?? 1); }
}

// Ramasser = équiper une arme (def.weapon)
export class WeaponPickup extends Collectable {
  collect(runner) { runner.equip(this.def.weapon); }
}

// Ramasser = bonus temporaire (def.effect)
export class EffectPickup extends Collectable {
  collect(runner) { runner.addEffect(this.def.effect); }
}

// Pad de sprint : reste en place, ne sert qu'une fois, seulement au sol
export class BoostPad extends Collectable {
  onContact(runner) {
    if (this.used || !runner.grounded) return;
    this.used = true;
    runner.addBoost(this.def.boost ?? 1.5, 'pad');
    this.game.emit('pad:used', { entity: this });
  }
}
