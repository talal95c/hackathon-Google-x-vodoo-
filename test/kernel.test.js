// Tests du kernel : il tourne sans navigateur ni Three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { Shop } from '../src/meta/Shop.js';
import { Profile } from '../src/meta/Profile.js';
import { MemoryStorage } from '../src/meta/Storage.js';

const idle = { steer: 0, drift: false, brake: false, jump: false };
const run = (game, seconds, intent = idle) => { for (let t = 0; t < seconds; t += 1 / 60) game.update(1 / 60, typeof intent === 'function' ? intent(game) : intent); };

// Pilote simple : reste au centre, contre la force centrifuge
const pilot = (g) => ({ ...idle, steer: Math.max(-1, Math.min(1, (-g.runner.x * 3 - g.runner.push) / 10)) });

test('même graine = même route', () => {
  const a = new Game({ seed: 42 }), b = new Game({ seed: 42 });
  a.track.ensure(3000); b.track.ensure(3000);
  assert.deepEqual(a.track.X.slice(0, 1500), b.track.X.slice(0, 1500));
});

test('la route avance toujours (jamais de croisement) et a des virages serrés', () => {
  const g = new Game({ seed: 7 });
  g.track.ensure(8000);
  const { Z, K } = g.track;
  for (let i = 1; i < Z.length; i++) assert.ok(Z[i] > Z[i - 1], `z recule à l'échantillon ${i}`);
  assert.ok(1 / Math.max(...K.map(Math.abs)) < 25, 'rayon mini attendu < 25 m');
});

test('sans piloter, le dino tombe dans un virage → game over immédiat', () => {
  const g = new Game({ seed: 3 });
  g.start({ seed: 3 });
  let over = null;
  g.on('game:over', (r) => { over = r; });
  run(g, 60);
  assert.equal(over?.reason, 'fall');
  assert.equal(g.lives, 3, 'aucune vie consommée : la chute termine la partie');
});

test('3 vies : trois chocs = fin de partie', () => {
  const g = new Game({ seed: 1 });
  g.start({ seed: 1 });
  let over = null;
  g.on('game:over', (r) => { over = r; });
  for (let i = 0; i < 3; i++) { g.runner.invul = 0; g.runner.hurt({}); }
  assert.equal(g.lives, 0);
  assert.equal(over?.reason, 'dead');
});

test('on peut sauter par-dessus un cactus', () => {
  const g = new Game({ seed: 1 });
  g.start({ seed: 1 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  const r = g.runner;
  g.spawn('cactus', r.z + 12, r.x);
  let hit = false;
  g.on('runner:hit', () => { hit = true; });
  run(g, 0.1);
  // saut au bon moment (~7 m avant : fenêtre valide ≈ 5 à 9 m à 21 m/s)
  while (g.entities.some((e) => e.type === 'cactus' && e.s - r.z > 7)) run(g, 1 / 60, pilot);
  g.update(1 / 60, { ...idle, jump: true });
  run(g, 1, pilot);
  assert.equal(hit, false);
});

test('le laser détruit les ennemis et rapporte des pièces', () => {
  const g = new Game({ seed: 1 });
  g.start({ seed: 1 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  g.runner.equip('laser');
  const target = g.spawn('popup', g.runner.z + 25, g.runner.x);
  run(g, 1, pilot);
  assert.equal(target.alive, false);
  assert.ok(g.coins >= target.reward);
});

test('pas de boss dans les zones', () => {
  const g = new Game({ seed: 5 });
  g.start({ seed: 5 });
  let boss = null;
  g.on('boss:start', (e) => { boss = e.boss; });
  g.runner.z = 690; g.sMax = 690; g.chaser.reset(690);
  run(g, 3, pilot);
  assert.equal(boss, null);
});

test('boutique : acheter un skin, un thème consommable et une amélioration', () => {
  const profile = new Profile(new MemoryStorage());
  const shop = new Shop(profile);
  assert.equal(shop.buy('skin:neon').reason, 'funds');
  profile.earn(1000);
  assert.ok(shop.buy('skin:neon').ok);
  assert.equal(shop.buy('skin:neon').reason, 'owned');
  assert.ok(shop.buy('music:reggae').ok);
  assert.ok(shop.buy('upgrade:weaponTime').ok);

  const loadout = shop.prepareRun();
  assert.equal(loadout.skin, 'neon');
  assert.equal(loadout.theme, 'reggae');
  assert.equal(profile.musicCount('reggae'), 0, 'le thème est consommé');
  assert.equal(shop.prepareRun().theme, 'techno', 'retour au thème gratuit');

  const g = new Game({ seed: 1 });
  g.start(loadout);
  assert.ok(Math.abs(g.runner.stats.get('weaponDuration') - 1.15) < 1e-9);
});

test('rythme : un obstacle est aimanté pour arriver sur un temps', () => {
  const g = new Game({ seed: 2 });
  g.start({ seed: 2 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  g.beat.setBpm(128);
  const r = g.runner;
  const cactus = g.spawn('cactus', r.z + 60, 5); // sur le côté : on ne le touche pas
  run(g, 1.2, pilot);
  const eta = (cactus.s - r.z) / r.speed;
  const beatsAtArrival = g.beat.beats + g.beat.beatsIn(eta);
  const offBeat = Math.abs(beatsAtArrival - Math.round(beatsAtArrival));
  assert.ok(offBeat < 0.06, `arrivée à ${offBeat.toFixed(3)} temps d'un temps fort`);
});

test('rythme : la foulée suit le tempo (2 pas par temps)', () => {
  const g = new Game({ seed: 2 });
  g.start({ seed: 2 });
  g.beat.setBpm(120);
  let steps = 0;
  g.on('runner:step', () => steps++);
  run(g, 4, pilot); // 4 s à 120 BPM = 8 temps = 16 pas
  assert.ok(Math.abs(steps - 16) <= 2, `${steps} pas`);
});
