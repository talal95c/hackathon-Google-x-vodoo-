import { ShopItems, Skins, MusicThemes } from '../kernel/Registry.js';

// Articles de boutique. category : 'skin' (permanent), 'music' (consommable), 'upgrade' (niveaux).
// Les skins et thèmes payants deviennent automatiquement des articles.
for (const skin of Skins.all()) {
  if (skin.price > 0) ShopItems.define(`skin:${skin.id}`, { category: 'skin', name: skin.name, price: skin.price, ref: skin.id, rarity: skin.rarity });
}
for (const theme of MusicThemes.all()) {
  if (theme.price > 0) ShopItems.define(`music:${theme.id}`, { category: 'music', name: `Musique ${theme.name}`, price: theme.price, ref: theme.id, consumable: true, desc: '1 partie' });
}

// Améliorations permanentes à niveaux : price(level) et modifiers(level)
ShopItems.define('upgrade:weaponTime', {
  category: 'upgrade', name: 'Armes plus longues', desc: '+15 % de durée par niveau', maxLevel: 5,
  price: (lvl) => 150 * (lvl + 1),
  modifiers: (lvl) => ({ mul: { weaponDuration: 1 + 0.15 * lvl } }),
});
ShopItems.define('upgrade:magnet', {
  category: 'upgrade', name: 'Aimant de départ', desc: 'Attire les pièces proches en permanence', maxLevel: 3,
  price: (lvl) => 250 * (lvl + 1),
  modifiers: (lvl) => ({ add: { magnetRange: 3 * lvl } }),
});
ShopItems.define('upgrade:extraLife', {
  category: 'upgrade', name: 'Vie supplémentaire', desc: '4 vies au lieu de 3', maxLevel: 1,
  price: () => 1500,
  modifiers: (lvl) => ({ add: { maxLives: lvl } }),
});
