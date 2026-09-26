import { Entities, Weapons, Effects } from '../kernel/Registry.js';
import { CoinPickup, WeaponPickup, EffectPickup, BoostPad } from '../entities/Collectable.js';
import { Projectile } from '../entities/Projectile.js';
import { LaserWeapon, ShieldWeapon } from '../weapons/Weapon.js';

// --- Collectables
Entities.define('coin', { class: CoinPickup, hitbox: { hx: 0.9, hz: 0.9, top: 3 }, value: 1 });
Entities.define('boostPad', { class: BoostPad, hitbox: { hx: 1.5, hz: 2.5, top: 0.5 }, boost: 1.5 });
Entities.define('laserPickup', { class: WeaponPickup, hitbox: { hx: 1.2, hz: 1.2, top: 3.5 }, weapon: 'laser' });
Entities.define('shieldPickup', { class: WeaponPickup, hitbox: { hx: 1.2, hz: 1.2, top: 3.5 }, weapon: 'shield' });
Entities.define('magnetPickup', { class: EffectPickup, hitbox: { hx: 1.2, hz: 1.2, top: 3.5 }, effect: 'magnet' });
Entities.define('doubleCoinsPickup', { class: EffectPickup, hitbox: { hx: 1.2, hz: 1.2, top: 3.5 }, effect: 'doubleCoins' });

// --- Armes (durée en secondes, multipliée par la stat weaponDuration)
Weapons.define('laser', { class: LaserWeapon, name: 'Laser', duration: 8, fireRate: 0.2, projectile: 'laserBolt', projectileSpeed: 60 });
Weapons.define('shield', { class: ShieldWeapon, name: 'Bouclier', duration: 6 });
Entities.define('laserBolt', { class: Projectile, hitbox: { hx: 0.4, hz: 0.8, top: 1 }, damage: 1, life: 1.2 });

// --- Bonus temporaires (modificateurs de stats)
Effects.define('magnet', { name: 'Aimant', duration: 10, modifiers: { add: { magnetRange: 14 } } });
Effects.define('doubleCoins', { name: 'Pièces ×2', duration: 12, modifiers: { mul: { coinMultiplier: 2 } } });
