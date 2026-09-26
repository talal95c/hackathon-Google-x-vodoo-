// Registres de contenu : tout ce qui est "ajoutable" (entités, armes, effets, skins,
// thèmes musicaux, articles de boutique) s'enregistre ici par un identifiant.
// Ajouter du contenu = un fichier dans src/content/ qui appelle X.define(...).
export class Registry {
  #items = new Map();
  constructor(name) { this.name = name; }

  define(id, def) {
    if (this.#items.has(id)) throw new Error(`[${this.name}] "${id}" est déjà défini`);
    const full = { id, ...def };
    this.#items.set(id, full);
    return full;
  }

  get(id) {
    const def = this.#items.get(id);
    if (!def) throw new Error(`[${this.name}] "${id}" inconnu (oublié dans content/index.js ?)`);
    return def;
  }

  has(id) { return this.#items.has(id); }
  all() { return [...this.#items.values()]; }
  ids() { return [...this.#items.keys()]; }
}

export const Entities = new Registry('entity');     // obstacles, ennemis, boss, collectables, projectiles
export const Weapons = new Registry('weapon');
export const Effects = new Registry('effect');      // bonus temporaires (aimant, pièces ×2…)
export const Skins = new Registry('skin');
export const MusicThemes = new Registry('music');
export const ShopItems = new Registry('shop');
