// Vibrations mobiles (API Vibration) associées aux événements du jeu.
// Les impulsions légères et répétées (pièces, pas) sont espacées pour rester lisibles.
import { LocalStorage } from '../meta/Storage.js';

const STORAGE_KEY = 'dino-escape-haptics';

export const PATTERNS = {
  tap: 8,
  coin: 10,
  powerUp: [20, 30, 20],
  jump: 8,
  land: 14,
  nearMiss: [12, 40, 12],
  hit: [70, 40, 110],
  shove: 25,
  fall: 180,
  boost: 40,
  world: [25, 40, 25],
  boss: [80, 50, 80],
  bossDefeated: [40, 30, 40, 30, 140],
  finisher: [60, 30, 60, 30, 160],
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
  on('entity:destroy', ({ entity, reason }) => {
    if (reason !== 'collected' || game.state !== 'playing') return;
    if (entity.type === 'coin') haptics.pulse('coin', { light: true });
    else haptics.pulse('powerUp');
  });
  on('runner:jump', () => haptics.pulse('jump', { light: true }));
  on('runner:land', ({ impact }) => { if (impact > 0.3) haptics.pulse('land', { light: true }); });
  on('runner:nearMiss', () => haptics.pulse('nearMiss'));
  on('runner:hit', () => haptics.pulse('hit'));
  on('runner:fall', () => haptics.pulse('fall'));
  on('runner:boost', ({ big }) => { if (big) haptics.pulse('boost'); });
  on('combat:impact', ({ local }) => { if (local) haptics.pulse('shove', { light: true }); });
  on('world:land', () => haptics.pulse('world'));
  on('boss:start', () => haptics.pulse('boss'));
  on('boss:defeated', () => haptics.pulse('bossDefeated'));
  on('club:finisher', () => haptics.pulse('finisher'));
  on('game:over', ({ reason }) => { if (reason !== 'fall') haptics.pulse('over'); });
}
