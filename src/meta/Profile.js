import { MusicThemes, Skins } from '../kernel/Registry.js';
import { CHALLENGES, FLASH_CHALLENGE } from '../content/challenges.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (now) => Math.floor(now / DAY_MS);

const DEFAULTS = {
  version: 1,
  coins: 0,          // portefeuille (pièces cumulées de partie en partie)
  best: 0,
  runs: 0,
  skins: ['classic', 'reggae'],
  skin: 'reggae',
  music: {},         // thèmes consommables : { reggae: 2, ... }
  theme: 'reggae',
  upgrades: {},      // { 'upgrade:weaponTime': 2, ... }
  challenge: null,
  daily: { day: null, streak: 0 },
  flash: { day: null, endsAt: 0, claimed: false },
};

// Progression persistante du joueur.
export class Profile {
  constructor(storage, key = 'dino-escape-profile') {
    this.storage = storage;
    this.key = key;
    this.data = { ...structuredClone(DEFAULTS), ...storage.load(key, {}) };
    // Starter additions are granted without replacing the player's selection or progress.
    for (const skin of Skins.all()) {
      if (skin.starter && !this.data.skins.includes(skin.id)) this.data.skins.push(skin.id);
    }
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
  selectSkin(id) {
    if (!this.ownsSkin(id)) return;
    this.data.skin = id;
    const theme = Skins.get(id).theme;
    if (theme && this.musicCount(theme) > 0) this.data.theme = theme;
    else if (this.musicCount(this.data.theme) <= 0) this.data.theme = 'techno';
    this.save();
  }

  // Musiques (consommables)
  musicCount(id) {
    if (Skins.get(this.data.skin).theme === id) return Infinity;
    return MusicThemes.get(id).consumable ? (this.data.music[id] ?? 0) : Infinity;
  }
  addMusic(id, n = 1) { this.data.music[id] = (this.data.music[id] ?? 0) + n; this.save(); }
  selectTheme(id) { if (this.musicCount(id) > 0) { this.data.theme = id; this.save(); } }
  consumeMusic(id) {
    if (this.musicCount(id) === Infinity) return true;
    if ((this.data.music[id] ?? 0) <= 0) return false;
    this.data.music[id]--; this.save();
    return true;
  }

  // Améliorations
  upgradeLevel(id) { return this.data.upgrades[id] ?? 0; }
  setUpgradeLevel(id, lvl) { this.data.upgrades[id] = lvl; this.save(); }
  selectChallenge(id) {
    if (id !== null && !CHALLENGES.some((c) => c.id === id)) return;
    this.data.challenge = id;
    this.save();
  }

  dailyStatus(now = Date.now()) {
    const today = dayOf(now), daily = this.data.daily;
    const claimed = daily.day !== null && daily.day >= today;
    const streak = daily.day !== null && daily.day >= today - 1 ? daily.streak : 0;
    const day = Math.min(7, streak + (claimed ? 0 : 1));
    return { claimed, day, reward: day * 10 };
  }

  claimDaily(now = Date.now()) {
    const status = this.dailyStatus(now);
    if (status.claimed) return 0;
    this.data.daily = { day: dayOf(now), streak: status.day };
    this.data.coins += status.reward;
    this.save();
    return status.reward;
  }

  flashStatus(now = Date.now()) {
    const flash = this.data.flash;
    if (!flash.claimed && flash.endsAt > now) return { state: 'active', remaining: flash.endsAt - now };
    if (flash.day === dayOf(now)) return { state: flash.claimed ? 'won' : 'expired', remaining: 0 };
    return { state: 'available', remaining: 0 };
  }

  startFlash(now = Date.now()) {
    if (this.flashStatus(now).state !== 'available') return false;
    this.data.flash = { day: dayOf(now), endsAt: now + FLASH_CHALLENGE.durationMs, claimed: false };
    this.save();
    return true;
  }

  completeFlash(pickups, now = Date.now()) {
    if (pickups < FLASH_CHALLENGE.target || this.flashStatus(now).state !== 'active') return 0;
    this.data.flash.claimed = true;
    this.data.coins += FLASH_CHALLENGE.reward;
    this.save();
    return FLASH_CHALLENGE.reward;
  }

  // Fin de partie : crédite les pièces, met à jour le record
  recordRun({ coins, score, challenge }) {
    const goal = CHALLENGES.find((c) => c.id === challenge?.id);
    const challengeReward = goal && challenge.complete ? goal.reward : 0;
    this.data.coins += coins + challengeReward;
    this.data.runs++;
    const isBest = score > this.data.best;
    if (isBest) this.data.best = score;
    this.save();
    return { isBest, best: this.data.best, challengeReward };
  }
}
