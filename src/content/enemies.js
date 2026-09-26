import { Entities } from '../kernel/Registry.js';
import { Obstacle, MovingEnemy } from '../entities/Enemy.js';

// Ennemis standards. hitbox.top bas (< 2.6) = on peut sauter par-dessus.
// top: Infinity = il faut esquiver (ou avoir une arme).
Entities.define('cactus', { class: Obstacle, hitbox: { hx: 1.1, hz: 0.5, top: 2.1 }, hp: 1, reward: 2 });
Entities.define('cactusBig', { class: Obstacle, hitbox: { hx: 1.9, hz: 0.5, top: 2.4 }, hp: 2, reward: 3 });
Entities.define('popup', { class: Obstacle, hitbox: { hx: 2, hz: 0.4, top: Infinity }, hp: 2, reward: 3 });
Entities.define('tabWall', { class: Obstacle, hitbox: { hx: 2.5, hz: 0.4, top: 1.45 }, hp: 1, reward: 2 });
Entities.define('cookieBanner', { class: Obstacle, hitbox: { hx: 3.25, hz: 0.4, top: 1.55 }, hp: 2, reward: 3 });

// Ennemis mobiles (comportement par def.motion, voir MovingEnemy)
Entities.define('popupSlider', { class: MovingEnemy, hitbox: { hx: 2, hz: 0.4, top: Infinity }, hp: 2, reward: 4, motion: { lateral: 3, freq: 1.6 } });
Entities.define('rollingCookie', { class: MovingEnemy, hitbox: { hx: 1.6, hz: 0.6, top: Infinity }, hp: 1, reward: 4, motion: { roll: 14 }, snap: false }); // roule tout seul : pas d'aimantation
