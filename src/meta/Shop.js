import { ShopItems, Skins, MusicThemes } from '../kernel/Registry.js';

// Boutique : achats avec les pièces du profil + préparation du "loadout" d'une partie.
export class Shop {
  constructor(profile, bus = null) {
    this.profile = profile;
    this.bus = bus;
  }

  items(category) { return ShopItems.all().filter((i) => !category || i.category === category); }

  priceOf(item) {
    item = typeof item === 'string' ? ShopItems.get(item) : item;
    return typeof item.price === 'function' ? item.price(this.profile.upgradeLevel(item.id)) : item.price;
  }

  // { ok, reason?: 'owned' | 'maxed' | 'funds', price }
  check(id) {
    const item = ShopItems.get(id), p = this.profile, price = this.priceOf(item);
    if (item.category === 'skin' && p.ownsSkin(item.ref)) return { ok: false, reason: 'owned', price };
    if (item.category === 'upgrade' && p.upgradeLevel(id) >= item.maxLevel) return { ok: false, reason: 'maxed', price };
    if (p.coins < price) return { ok: false, reason: 'funds', price };
    return { ok: true, price };
  }

  buy(id) {
    const res = this.check(id);
    if (!res.ok) return res;
    const item = ShopItems.get(id), p = this.profile;
    p.spend(res.price);
    if (item.category === 'skin') { p.addSkin(item.ref); p.selectSkin(item.ref); }
    else if (item.category === 'music') { p.addMusic(item.ref, 1); p.selectTheme(item.ref); }
    else if (item.category === 'upgrade') p.setUpgradeLevel(id, p.upgradeLevel(id) + 1);
    this.bus?.emit('shop:purchase', { item, price: res.price });
    return res;
  }

  // Loadout pour Game.start() : skin, musique (consommée ici), modificateurs de stats
  prepareRun() {
    const p = this.profile;
    const skin = Skins.get(p.data.skin);
    let theme = p.data.theme;
    if (!MusicThemes.has(theme) || !p.consumeMusic(theme)) theme = 'techno';
    if (p.data.theme !== 'techno' && p.musicCount(p.data.theme) <= 0) p.selectTheme('techno');

    const modifiers = [];
    if (skin.modifiers) modifiers.push({ source: 'skin', ...skin.modifiers });
    for (const item of this.items('upgrade')) {
      const lvl = p.upgradeLevel(item.id);
      if (lvl > 0) modifiers.push({ source: item.id, ...item.modifiers(lvl) });
    }
    return { skin: skin.id, theme, modifiers };
  }
}
