import { Skins } from '../kernel/Registry.js';

// Skins : view = données pour la vue (modèle + couleurs), modifiers = bonus de stats optionnels.
// Pour un modèle 3D : view: { model: 'gltf', url: '/models/dino-rex.glb' } (voir view/ModelRegistry.js)
Skins.define('reggae', {
  name: 'Riddim · Reggae', price: 0, rarity: 'rare', starter: true, theme: 'reggae',
  description: 'Le soleil dans les oreilles. Reggae inclus.',
  view: { model: 'reggaeDino', color: 0x24be9f },
});

Skins.define('bnw', {
  name: 'BNW · Smash', price: 0, rarity: 'rare', starter: true, theme: 'bnw',
  view: { model: 'blockDino', color: 0x143852, emissive: 0x0a1c2a, eye: 0xffcc40 },
});

Skins.define('classic', { name: 'Classique', price: 0, rarity: 'common', view: { model: 'blockDino', color: 0x535353, eye: 0xffffff } });
Skins.define('neon', { name: 'Néon', price: 300, rarity: 'rare', view: { model: 'blockDino', color: 0x00e5ff, emissive: 0x006070, eye: 0xff4fa3 } });
Skins.define('gold', {
  name: 'Doré', price: 1200, rarity: 'epic',
  view: { model: 'blockDino', color: 0xffc107, emissive: 0x4a3000, eye: 0x222222 },
  modifiers: { mul: { coinMultiplier: 1.1 } },
});
