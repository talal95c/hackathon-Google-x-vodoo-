// Vibrations mobiles (API Vibration) associées aux événements du jeu.
// Les impulsions légères et répétées (pièces, pas) sont espacées pour rester lisibles.
import { LocalStorage } from '../meta/Storage.js';

const STORAGE_KEY = 'dino-escape-haptics';

export const PATTERNS = {
  tap: 8,
  coin: 10,
  goldCoin: 18,
  powerUp: [20, 30, 20],
  jump: 8,
  land: 14,
  nearMiss: [12, 40, 12],
  parry: [35, 25, 60],
  parryMiss: 12,
  hit: [70, 40, 110],
  fall: 180,
  boost: 40,
  fever: [40, 30, 40, 30, 90],
  world: [25, 40, 25],
  boss: [80, 50, 80],
  bossDefeated: [40, 30, 40, 30, 140],
  reward: [30, 40, 30, 40, 90],
  over: [120, 60, 220],
};

export class Haptics {
  constructor({ vibrate = globalThis.navigator?.vibrate?.bind(globalThis.navigator), storage = new LocalStorage(), now = () => performance.now() } = {}) {
    this.vibrate = vibrate;
    this.storage = storage;
    this.now = now;
    this.last = -Infinity;
    this.enabled = storage.load(STORAGE_KEY, true) !== false;
  }

  get supported() { return typeof this.vibrate === 'function'; }

  setEnabled(on) {
    this.enabled = on;
    this.storage.save(STORAGE_KEY, on);
    if (!on) this.vibrate?.(0);
  }

  // light : ignorée si une autre vibration a eu lieu il y a moins de 70 ms
  pulse(name, { light = false } = {}) {
    if (!this.enabled || !this.supported) return false;
    const t = this.now();
    if (light && t - this.last < 70) return false;
    this.last = t;
    try { return this.vibrate(PATTERNS[name] ?? name) !== false; } catch { return false; }
  }
}

export function bindHaptics(game, haptics) {
  const on = (type, fn) => game.on(type, fn);
  const playing = () => game.state === 'playing';
  on('entity:destroy', ({ entity, reason }) => {
    if (reason !== 'collected' || !playing()) return;
    if (entity.type === 'coin') haptics.pulse('coin', { light: true });
    else if (entity.type === 'goldCoin') haptics.pulse('goldCoin', { light: true });
    else haptics.pulse('powerUp');
  });
  on('runner:jump', () => haptics.pulse('jump', { light: true }));
  on('runner:land', ({ impact }) => { if (impact > 0.3) haptics.pulse('land', { light: true }); });
  on('runner:nearMiss', () => haptics.pulse('nearMiss'));
  on('runner:parry', () => haptics.pulse('parry'));
  on('runner:parry:miss', () => haptics.pulse('parryMiss'));
  on('runner:hit', () => haptics.pulse('hit'));
  on('runner:fall', () => haptics.pulse('fall'));
  on('runner:boost', ({ big }) => { if (big) haptics.pulse('boost'); });
  on('fever:start', () => haptics.pulse('fever'));
  on('world:land', () => haptics.pulse('world'));
  on('boss:start', () => haptics.pulse('boss'));
  on('boss:defeated', () => haptics.pulse('bossDefeated'));
  on('game:over', ({ reason }) => { if (reason !== 'fall') haptics.pulse('over'); });
}
