import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../src/content/index.js';
import { FightFx } from '../src/view/fightFx.js';
import { Game } from '../src/kernel/Game.js';
import { Profile } from '../src/meta/Profile.js';
import { MemoryStorage } from '../src/meta/Storage.js';
import { Multiplayer } from '../src/net/Multiplayer.js';
import { Bots } from '../src/bots/Bots.js';
import { bindSfx } from '../src/audio/Sfx.js';

// Regression: l'ancien effet accumulait rotation.z, jusqu'à cacher les dinos sous la route.
test('claques répétées : aucune dérive du placement réseau ni rotation du dino', () => {
  const root = new THREE.Group(); root.position.set(12, 3, 40); root.rotation.set(.1, .7, 0);
  const fx = new FightFx(root), pose = root.rotation.toArray(), position = root.position.toArray();
  for (let round = 0; round < 30; round++) {
    fx.shove(round % 2 ? -1 : 1); fx.hit(round % 2 ? 1 : -1);
    for (let i = 0; i < 50; i++) {
      fx.apply(1 / 60, i < 20, i / 60);
      assert.deepEqual(root.position.toArray(), position);
      assert.deepEqual(root.rotation.toArray(), pose);
      assert.equal(fx.pivot.rotation.y, 0, 'pas de tournoiement');
      assert.ok(Math.abs(fx.pivot.rotation.z) < .3);
    }
    assert.equal(fx.pivot.position.length(), 0); assert.equal(fx.pivot.rotation.z, 0);
    assert.equal(fx.hand.visible, false);
  }
  fx.hit(1); fx.shove(-1); fx.reset();
  assert.equal(fx.stars.visible, false); assert.deepEqual(fx.pivot.scale.toArray(), [1, 1, 1]);
  fx.dispose(); assert.equal(root.children.length, 0);
});

test('flash de claque : ne recolore pas les skins partagés, libère ses matériaux', () => {
  const shared = new THREE.MeshStandardMaterial({ color: 0x229944 }), geo = new THREE.BoxGeometry();
  const model = new THREE.Mesh(geo, shared), other = new THREE.Mesh(geo, shared), root = new THREE.Group(), fx = new FightFx(root);
  fx.attachModel(model); const isolated = model.material; let disposed = 0;
  isolated.addEventListener('dispose', () => disposed++);
  fx.hit(1); fx.apply(.01, true, .01);
  assert.notEqual(model.material.color.getHex(), shared.color.getHex());
  assert.equal(other.material.color.getHex(), 0x229944);
  fx.detachModel(); assert.equal(model.material, shared); assert.equal(disposed, 1);
  fx.dispose(); shared.dispose(); geo.dispose();
});

async function players() {
  const members = new Map(); let id = 0;
  const connectFn = async () => {
    const selfId = `p${++id}`, handlers = new Map(); members.set(selfId, handlers);
    return { selfId, transport: 'test', channel: name => ({
      on: fn => handlers.set(name, fn),
      send: (data, to) => { for (const [pid, h] of members) if (pid !== selfId && (!to || to === pid)) h.get(name)?.(structuredClone(data), selfId); },
    }), leave: () => members.delete(selfId) };
  };
  const ps = [];
  for (let i = 0; i < 3; i++) {
    const g = new Game({ seed: 4 }), mp = new Multiplayer(g, new Profile(new MemoryStorage()), { connectFn });
    mp.on('start', ({ seed }) => g.start({ seed }));
    if (i) await mp.join(ps[0].mp.code); else await mp.create();
    ps.push({ g, mp, impacts: [] });
    g.on('combat:impact', e => ps[i].impacts.push(e));
  }
  for (const p of ps) p.mp.setName(p.mp.net.selfId);
  ps[0].mp.startRace();
  for (let i = 0; i < ps.length; i++) { const r = ps[i].g.runner; r.z = 80; r.x = i === 0 ? -1.5 : i === 1 ? 2 : 12; r.speed = r.latV = r.knockV = 0; }
  for (let i = 0; i < 5; i++) for (const p of ps) p.mp.update(1 / 30, { shove: false });
  for (const p of ps) p.impacts.length = 0;
  return ps;
}

test('réseau : la victime confirme une seule claque au bon endroit, visible des trois joueurs', async () => {
  const [a, b, c] = await players();
  a.mp.update(1 / 60, { shove: true });
  assert.equal(b.g.runner.knockV, 26);
  for (const p of [a, b, c]) {
    const hits = p.impacts.filter(e => e.kind === 'shove'); assert.equal(hits.length, 1);
    assert.equal(hits[0].s, b.g.runner.z); assert.equal(hits[0].d, b.g.runner.x); assert.equal(hits[0].targetId, b.mp.net.selfId);
  }
  assert.equal(a.impacts[0].local, 'dealt'); assert.equal(b.impacts[0].local, 'received'); assert.equal(c.impacts[0].local, null);
  a.mp.update(1 / 60, { shove: true }); assert.equal(b.g.runner.knockV, 26, 'la recharge empêche le spam');
  a.mp.startRace(); assert.equal(a.mp.shoveCooldown, 0, 'revanche prête');
  for (const p of [a, b, c]) p.mp.leave();
});

test('réseau : aucune confirmation si la victime ne joue plus, ni pour une claque dans le vide', async () => {
  const [a, b, c] = await players();
  b.g.state = 'over'; a.mp.update(1 / 60, { shove: true });
  assert.equal(b.g.runner.knockV, 0); assert.equal(a.impacts.length, 0);
  a.mp.startRace();
  for (const p of [b, c]) { p.g.runner.z = a.g.runner.z + 50; p.g.runner.speed = 0; }
  for (let i = 0; i < 5; i++) for (const p of [a, b, c]) p.mp.update(1 / 30, {});
  for (const p of [a, b, c]) p.impacts.length = 0;
  a.mp.update(1 / 60, { shove: true }); assert.equal(a.impacts.length, 0);
  for (const p of [a, b, c]) p.mp.leave();
});

test('PNJ : impact sur le rival touché et son de claque seulement sur impact confirmé', () => {
  const g = new Game({ seed: 8 }); g.start({ seed: 8 });
  const bots = new Bots(g, 1); bots.start();
  const b = bots.list[0]; b.s = g.runner.z; b.d = 3.5; b.aggression = 0;
  const hits = []; g.on('combat:impact', e => hits.push(e));
  let smacks = 0, wind = 0;
  bindSfx(g, { slap: () => smacks++, noise: () => wind++ });
  bots.update(1 / 60, { shove: true });
  assert.equal(hits.length, 1); assert.equal(hits[0].targetId, b.id); assert.equal(hits[0].d, b.d);
  assert.equal(smacks, 1); assert.equal(wind, 1);
  g.emit('mp:shove', { hit: false, dir: 1 }); assert.equal(smacks, 1); assert.equal(wind, 2);
});
