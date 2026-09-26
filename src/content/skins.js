import { Skins } from '../kernel/Registry.js';

// Skins : view = données pour la vue (modèle + couleurs), modifiers = bonus de stats optionnels.
// Pour un modèle 3D : view: { model: 'gltf', url: '/models/dino-rex.glb' } (voir view/ModelRegistry.js)
Skins.define('reggae', {
  name: 'Riddim · Reggae', price: 0, rarity: 'rare', starter: true, theme: 'reggae',
  description: 'Sunshine in your ears. Reggae included.',
  view: { model: 'reggaeDino', color: 0x24be9f },
});

Skins.define('classic', { name: 'Classic', price: 0, rarity: 'common', view: { model: 'blockDino', color: 0x535353, eye: 0xffffff } });
Skins.define('vader', {
  name: 'Darth Vader', price: 0, rarity: 'epic', starter: true,
  description: 'Black helmet, flowing cape and red saber.',
  view: { model: 'costumeDino', costume: 'vader', color: 0x343d4c },
});
Skins.define('drift', {
  name: 'Drift · Fortnite', price: 0, rarity: 'epic', starter: true,
  description: 'Kitsune mask, pink jacket and energy pickaxe.',
  view: { model: 'costumeDino', costume: 'drift', color: 0xea5397 },
});
Skins.define('mario', {
  name: 'Mario', price: 0, rarity: 'rare', starter: true,
  description: 'Red cap, mustache and blue overalls.',
  view: { model: 'costumeDino', costume: 'mario', color: 0xde3e44 },
});
Skins.define('alligator', {
  name: 'Alligator', price: 0, rarity: 'rare', starter: true,
  description: 'Long snout, tiny teeth and emerald scales.',
  view: { model: 'costumeDino', costume: 'alligator', color: 0x4d9167 },
});
Skins.define('neon', { name: 'Neon', price: 300, rarity: 'rare', view: { model: 'blockDino', color: 0x00e5ff, emissive: 0x006070, eye: 0xff4fa3 } });
Skins.define('gold', {
  name: 'Golden', price: 1200, rarity: 'epic',
  view: { model: 'blockDino', color: 0xffc107, emissive: 0x4a3000, eye: 0x222222 },
  modifiers: { mul: { coinMultiplier: 1.1 } },
});
