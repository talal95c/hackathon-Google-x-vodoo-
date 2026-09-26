import { Entities, Weapons, Effects } from '../kernel/Registry.js';
import { ItemBox, TrapTab } from '../entities/RaceEntities.js';
import { LaserWeapon } from '../weapons/Weapon.js';

// Contenu propre à la Course Royale
Entities.define('itemBox', { class: ItemBox, hitbox: { hx: 1.1, hz: 1.1, top: 3.5 } });
Entities.define('trapTab', { class: TrapTab, hitbox: { hx: 1.2, hz: 0.5, top: 1.4 }, damage: 1 });
Weapons.define('raceLaser', { class: LaserWeapon, name: 'Laser', duration: 1.2, fireRate: 0.12, projectile: 'laserBolt', projectileSpeed: 60 });
Effects.define('rage', { name: 'RAGE', duration: 5, modifiers: { mul: { baseSpeed: 1.08 } } });
