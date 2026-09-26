import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { Haptics, bindHaptics, PATTERNS } from '../src/input/Haptics.js';
import { MemoryStorage } from '../src/meta/Storage.js';

const fake = () => {
  const calls = [];
  let now = 0;
  const haptics = new Haptics({ vibrate: (p) => { calls.push(p); return true; }, storage: new MemoryStorage(), now: () => now });
  return { haptics, calls, advance: (ms) => { now += ms; } };
};

test('vibrations : sans API Vibration, aucune erreur ni appel', () => {
  const h = new Haptics({ vibrate: undefined, storage: new MemoryStorage() });
  assert.equal(h.supported, false);
  assert.equal(h.pulse('hit'), false);
});

test('vibrations : impulsions légères espacées, désactivation mémorisée', () => {
  const { haptics, calls, advance } = fake();
  haptics.pulse('coin', { light: true });
  haptics.pulse('coin', { light: true });
  assert.deepEqual(calls, [PATTERNS.coin]);
  advance(100);
  haptics.pulse('coin', { light: true });
  haptics.pulse('hit');
  assert.deepEqual(calls, [PATTERNS.coin, PATTERNS.coin, PATTERNS.hit]);
  haptics.setEnabled(false);
  assert.equal(haptics.pulse('hit'), false);
  assert.equal(new Haptics({ vibrate: () => true, storage: haptics.storage }).enabled, false);
});

test('vibrations : chaque action importante du jeu a son motif', () => {
  const { haptics, calls, advance } = fake();
  const g = new Game({ seed: 3 });
  bindHaptics(g, haptics);
  g.start({ seed: 3 });
  for (const [type, payload, pattern] of [
    ['runner:nearMiss', {}, PATTERNS.nearMiss],
    ['runner:hit', {}, PATTERNS.hit],
    ['combat:impact', { local: true }, PATTERNS.shove],
    ['boss:defeated', {}, PATTERNS.bossDefeated],
    ['club:finisher', {}, PATTERNS.finisher],
  ]) {
    advance(200);
    g.emit(type, payload);
    assert.deepEqual(calls.at(-1), pattern, type);
  }
  advance(200);
  g.spawn('coin', g.runner.z, g.runner.x).onContact(g.runner);
  assert.deepEqual(calls.at(-1), PATTERNS.coin);
});
