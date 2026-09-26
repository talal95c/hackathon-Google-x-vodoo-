import { MusicThemes } from '../kernel/Registry.js';

const DEFAULTS = {
  version: 1,
  coins: 0,          // portefeuille (pièces cumulées de partie en partie)
  best: 0,
  runs: 0,
  skins: ['classic'],
  skin: 'classic',
  music: {},         // thèmes consommables : { reggae: 2, ... }
  theme: 'techno',
  upgrades: {},      // { 'upgrade:weaponTime': 2, ... }
};

// Progression persistante du joueur.
export class Profile {
  constructor(storage, key = 'dino-escape-profile') {
    this.storage = storage;
    this.key = key;
    this.data = { ...structuredClone(DEFAULTS), ...storage.load(key, {}) };
  }

  save() { this.storage.save(this.key, this.data); }

  get coins() { return this.data.coins; }
  earn(n) { this.data.coins += n; this.save(); }
  spend(n) {
    if (n > this.data.coins) return false;
    this.data.coins -= n; this.save();
    return true;
  }

  // Skins
  ownsSkin(id) { return this.data.skins.includes(id); }
  addSkin(id) { if (!this.ownsSkin(id)) this.data.skins.push(id); this.save(); }
  selectSkin(id) { if (this.ownsSkin(id)) { this.data.skin = id; this.save(); } }

  // Musiques (consommables)
  musicCount(id) { return MusicThemes.get(id).consumable ? (this.data.music[id] ?? 0) : Infinity; }
  addMusic(id, n = 1) { this.data.music[id] = (this.data.music[id] ?? 0) + n; this.save(); }
  selectTheme(id) { if (this.musicCount(id) > 0) { this.data.theme = id; this.save(); } }
  consumeMusic(id) {
    if (!MusicThemes.get(id).consumable) return true;
    if ((this.data.music[id] ?? 0) <= 0) return false;
    this.data.music[id]--; this.save();
    return true;
  }

  // Améliorations
  upgradeLevel(id) { return this.data.upgrades[id] ?? 0; }
  setUpgradeLevel(id, lvl) { this.data.upgrades[id] = lvl; this.save(); }

  // Fin de partie : crédite les pièces, met à jour le record
  recordRun({ coins, score }) {
    this.data.coins += coins;
    this.data.runs++;
    const isBest = score > this.data.best;
    if (isBest) this.data.best = score;
    this.save();
    return { isBest, best: this.data.best };
  }
}
