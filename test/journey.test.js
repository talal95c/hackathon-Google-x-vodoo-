import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { Track } from '../src/kernel/Track.js';
import { TRACK } from '../src/kernel/config.js';
import { ZONES } from '../src/content/zones.js';
import { WORLD_JUMP, isWorldSafe, isWorldGap } from '../src/kernel/WorldJourney.js';

const idle = { steer: 0, drift: false, brake: false, jump: false };

test('le parcours traverse les cinq couches puis reste dans le cloud', () => {
  assert.deepEqual(ZONES.map(z => z.id), ['offline', 'browser', 'windows', 'hardware', 'cloud']);
  for (let i = 0; i < 5; i++) assert.equal(Track.zoneIndex(i * TRACK.zoneLength + 2), i);
  assert.equal(Track.zoneIndex(1e6), 4);
  assert.equal(isWorldGap(4 * TRACK.zoneLength), true);
  assert.equal(isWorldGap(5 * TRACK.zoneLength), false);
});

for (let next = 1; next < 5; next++) test(`portail ${next} : saut guidé, changement de monde et atterrissage`, () => {
  const g = new Game({ seed: 9 }); g.start({ seed: 9 });
  const boundary = next * TRACK.zoneLength, r = g.runner;
  r.z = boundary - WORLD_JUMP.lead + .01; r.x = 3;
  g.track.update(r.z); r.Y = g.track.frame(r.z).y;
  g.zoneIndex = next - 1; g.nextWorld = next; g.sMax = r.z;
  let launched = 0, landed = 0, changed = 0, maxHeight = 0;
  g.on('world:jump', () => launched++); g.on('world:land', () => landed++);
  g.on('zone', () => changed++);
  g.update(1 / 60, idle); assert.ok(g.worldJump); assert.equal(launched, 1);
  assert.equal(r.hurt({}), false, 'pas de dégâts pendant le passage');
  for (let i = 0; i < 300 && g.worldJump; i++) {
    // Conflicting inputs must not derail the cinematic or buffer a surprise jump.
    g.update(1 / 60, { steer: 1, drift: true, jump: true, brake: true });
    maxHeight = Math.max(maxHeight, r.y);
  }
  assert.equal(g.state, 'playing'); assert.equal(g.worldJump, null);
  assert.equal(g.zoneIndex, next); assert.equal(changed, 1); assert.equal(landed, 1);
  assert.ok(maxHeight > 16); assert.ok(r.grounded); assert.ok(Math.abs(r.x) < .1);
  assert.ok(r.z >= boundary + WORLD_JUMP.tail); assert.equal(isWorldGap(r.z), false);
  const oldLatV = r.latV;
  g.update(.05, { ...idle, steer: .5 }); assert.ok(r.latV > oldLatV, 'commandes rétablies');
  g.start({ seed: 9 }); assert.equal(g.worldJump, null); assert.equal(g.nextWorld, 1);
});

test('la génération garde les départs et arrivées des portails dégagés', () => {
  const g = new Game({seed:42});g.start({seed:42});
  for(let distance=0;distance<TRACK.zoneLength*5;distance+=120){
    g.runner.z=distance;g.track.update(distance);
    for(const e of g.entities)if(e.alive)assert.equal(isWorldSafe(e.s),false, `${e.type} dans un portail à ${e.s}`);
  }
});

test('une bannière prévient du changement de monde, seconde par seconde', () => {
  const g = new Game({ seed: 9 }); g.start({ seed: 9 });
  const r = g.runner, warnings = [];
  g.on('world:soon', ({ seconds, to }) => warnings.push([seconds, to.id]));
  r.z = TRACK.zoneLength - WORLD_JUMP.lead - r.speed * 6;
  g.track.update(r.z); r.Y = g.track.frame(r.z).y; g.sMax = r.z;
  for (let i = 0; i < 60 * 8 && !g.worldJump && warnings.length < 5; i++) g.update(1 / 60, idle);
  assert.deepEqual(warnings.map(([s]) => s), [5, 4, 3, 2, 1]);
  assert.ok(warnings.every(([, id]) => id === 'browser'));
});
