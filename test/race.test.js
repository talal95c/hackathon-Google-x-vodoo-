// Tests de la Course Royale : règles, noyau de course, bots, déterminisme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { ROYALE } from '../src/kernel/config.js';
import { RaceCore } from '../src/race/RaceCore.js';
import { LocalHost } from '../src/race/LocalHost.js';
import { Participant } from '../src/race/Participant.js';
import { eliminationSchedule, rollItem, placeBand, eloUpdate, trophyDelta, coinReward, comboEffect, rankOf, ITEM_IDS } from '../src/race/rules.js';

const idle = { steer: 0, drift: false, brake: false, jump: false };
const fakeClock = () => { const c = { t: 0 }; c.now = () => c.t; return c; };

test('calendrier : la dernière élimination tombe à 2:15, une toutes les 20 s', () => {
  assert.deepEqual(eliminationSchedule(5), [75, 95, 115, 135]);
  assert.deepEqual(eliminationSchedule(2), [135]);
  assert.deepEqual(eliminationSchedule(1), []);
});

test('objets : les derniers tirent des objets plus forts, jamais de Virus en tête', () => {
  assert.equal(placeBand(1, 5), 0); assert.equal(placeBand(5, 5), 3);
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const first = new Set(), last = new Set();
  for (let i = 0; i < 2000; i++) { first.add(rollItem(1, 5, rnd)); last.add(rollItem(5, 5, rnd)); }
  assert.ok(!first.has('virus') && !first.has('express') && !first.has('lag'));
  assert.ok(last.has('virus') && last.has('express'));
  for (const id of [...first, ...last]) assert.ok(ITEM_IDS.includes(id));
});

test('combo : chaque palier donne un sprint et une poussée plus forte, objet au palier 3, RAGE au 5', () => {
  const c1 = comboEffect(1, 0), c3 = comboEffect(3, 2), c5 = comboEffect(5, 4);
  assert.ok(c3.boost > c1.boost && c3.shoveMul > c1.shoveMul);
  assert.ok(c3.freeItem && !c1.freeItem && !comboEffect(4, 3).freeItem);
  assert.ok(c5.rage && !comboEffect(5, 5).rage);
});

test('Elo : le vainqueur monte, le dernier descend, somme ≈ 0 ; trophées et pièces selon la place', () => {
  const d = eloUpdate([{ id: 'a', elo: 1000, place: 1 }, { id: 'b', elo: 1000, place: 2 }, { id: 'c', elo: 1000, place: 3 }]);
  assert.ok(d.get('a') > 0 && d.get('c') < 0);
  assert.ok(Math.abs(d.get('a') + d.get('b') + d.get('c')) <= 1);
  assert.ok(trophyDelta(1, 5) > 0 && trophyDelta(5, 5) < 0);
  assert.ok(coinReward(1, 5) > coinReward(2, 5));
  assert.equal(rankOf(1950).id, 'root'); assert.equal(rankOf(0).id, 'bronze');
});

test('mode royale : tomber = retour sur la route, pas de game over ; la route est plus étroite', () => {
  const g = new Game();
  g.start({ mode: 'royale', seed: 3 });
  let respawn = 0, over = false;
  g.on('runner:respawn', () => respawn++);
  g.on('game:over', () => { over = true; });
  for (let t = 0; t < 40; t += 1 / 60) { g.runner.invul = 1e9; g.update(1 / 60, idle); }
  assert.ok(respawn > 0, 'le dino doit revenir après une chute');
  assert.equal(over, false);
  assert.equal(g.state === 'playing' || g.state === 'falling', true);
  assert.equal(g.track.widthProfile.min, ROYALE.width.min);
  g.track.ensure(6000);
  assert.ok(Math.min(...g.track.W) < 12.5);
});

test('mode royale : même graine = mêmes obstacles et boîtes, quels que soient les choix du joueur', () => {
  const layout = (steer) => {
    const g = new Game(), seen = new Map();
    g.on('entity:spawn', (e) => { if (e.chunk !== null) seen.set(`${e.type}@${e.s.toFixed(2)}`, e.d.toFixed(2)); });
    g.start({ mode: 'royale', seed: 99 });
    for (let t = 0; t < 30; t += 1 / 60) { g.runner.invul = 1e9; g.update(1 / 60, { ...idle, steer: steer(t), jump: t % 2 < 0.02 }); }
    return seen;
  };
  const a = layout(() => 0), b = layout((t) => Math.sin(t * 3));
  const keys = [...a.keys()].filter((k) => b.has(k));
  assert.ok(keys.length > 30, 'assez d\'apparitions communes');
  for (const k of keys) assert.equal(a.get(k), b.get(k), k);
  assert.ok([...a.keys()].some((k) => k.startsWith('itemBox')), 'des boîtes « ? » apparaissent');
});

test('coup d\'épaule : pousse le rival touché, crédite un combo qui booste le pousseur', () => {
  const c = fakeClock(), out = [];
  const core = new RaceCore({ now: c.now, send: (to, msg) => out.push([to, msg]) });
  core.addPlayer({ id: 'a' }); core.addPlayer({ id: 'b' });
  core.start({ seed: 1 });
  c.t = 3000; core.tick();
  c.t = 4000;
  core.onMessage('a', { t: 'snap', ts: 1, z: 50, x: 0, y: 0, sp: 30, st: 'run', f: 0 });
  core.onMessage('b', { t: 'snap', ts: 1, z: 51, x: 2, y: 0, sp: 30, st: 'run', f: 0 });
  core.onMessage('a', { t: 'shove', dir: 1, ts: 1 });
  const imp = out.find(([to, m]) => to === 'b' && m.t === 'impulse');
  assert.ok(imp && imp[1].dx > 0, 'impulsion vers la gauche envoyée à b');
  const combo = out.find(([to, m]) => to === 'a' && m.t === 'combo');
  assert.ok(combo && combo[1].level === 1 && combo[1].boost > 0);
  // b tombe dans les 3 s → sortie de route créditée à a (+2 au combo)
  core.onMessage('b', { t: 'fell' });
  const ring = out.find(([, m]) => m.t === 'feed' && m.kind === 'ringout');
  assert.ok(ring && ring[1].a === 'a');
  assert.equal(core.players.get('a').combo.level, 3);
  assert.ok(out.some(([to, m]) => to === 'a' && m.t === 'item' && m.source === 'combo'), 'palier 3 : objet offert');
});

test('dépassement : doubler un rival fait monter le combo', () => {
  const c = fakeClock(), out = [];
  const core = new RaceCore({ now: c.now, send: (to, msg) => out.push([to, msg]) });
  core.addPlayer({ id: 'a' }); core.addPlayer({ id: 'b' });
  core.start({ seed: 1 }); c.t = 3000; core.tick();
  const snap = (id, ts, z) => core.onMessage(id, { t: 'snap', ts, z, x: 0, y: 0, sp: 30, st: 'run', f: 0 });
  c.t = 4000; snap('a', 1, 40); snap('b', 1, 50); core.tick();
  c.t = 5000; snap('a', 2, 70); snap('b', 2, 60); core.tick();
  assert.equal(core.players.get('a').stats.overtakes, 1);
  assert.ok(out.some(([to, m]) => to === 'a' && m.t === 'combo' && m.kind === 'overtake'));
});

test('anti-triche : un instantané impossible est borné', () => {
  const c = fakeClock();
  const core = new RaceCore({ now: c.now, send: () => {} });
  core.addPlayer({ id: 'a' }); core.addPlayer({ id: 'b' });
  core.start({ seed: 1 }); c.t = 3000; core.tick(); c.t = 4000;
  core.onMessage('a', { t: 'snap', ts: 1, z: 10, x: 0 });
  core.onMessage('a', { t: 'snap', ts: 1.1, z: 5000, x: 0 });
  assert.ok(core.players.get('a').snap.z < 40);
});

test('course complète entre 5 bots : éliminations à l\'heure, un seul vainqueur, podium cohérent', () => {
  const c = fakeClock(), host = new LocalHost({ clock: c.now });
  host.addBots(5);
  const elims = [];
  let end = null;
  host.clients.set('spy', (m) => { if (m.t === 'elim') elims.push({ ...m, at: host.core.raceTime }); if (m.t === 'race:end') end = m; });
  host.start(1234);
  const dt = 1 / 30;
  for (let i = 0; i < 145 * 30 && !end; i++) { c.t += dt * 1000; host.update(dt); }
  assert.ok(end, 'la course se termine');
  assert.equal(elims.length, 4);
  elims.forEach((e, i) => assert.ok(Math.abs(e.at - eliminationSchedule(5)[i]) < 0.1));
  assert.deepEqual(end.results.map((r) => r.place), [1, 2, 3, 4, 5]);
  assert.ok(end.results[0].distance > 1500, `le vainqueur a roulé (${end.results[0].distance} m)`);
  const totals = end.results.reduce((a, r) => a + r.stats.overtakes + r.stats.shoves, 0);
  assert.ok(totals > 0, 'il se passe des choses entre bots');
});

test('participant : reçoit objet, l\'utilise, subit une attaque et renvoie le résultat', () => {
  const c = fakeClock(), sent = [];
  const g = new Game();
  const p = new Participant({ game: g, id: 'me', send: (m) => sent.push(m), clock: c.now });
  p.handle({ t: 'race:start', seed: 5, startAt: 3000, schedule: [135], players: [{ id: 'me' }, { id: 'r' }] });
  c.t = 3000; p.update(1 / 60, idle);
  assert.equal(g.state, 'playing'); assert.equal(g.mode, 'royale');
  p.handle({ t: 'item', item: 'turbo', roll: 0 });
  p.update(1 / 60, { ...idle, item: true });
  assert.ok(g.runner.boost > 1.5);
  assert.ok(sent.some((m) => m.t === 'use' && m.item === 'turbo'));
  g.runner.invul = 0;
  p.handle({ t: 'hit', from: 'r', kind: 'popup', dodgeable: true, slow: 1 });
  assert.equal(sent.at(-1).t, 'hitres'); assert.equal(sent.at(-1).res, 'hit');
  p.handle({ t: 'elim', id: 'me', place: 2 });
  assert.equal(g.state, 'over'); assert.equal(p.phase, 'out');
});

test('pouce : glisser = direction analogique, coup vers le haut = saut, bas = glissade, coup latéral = poussée, 2e doigt = objet', async () => {
  const { ThumbGestures } = await import('../src/input/ThumbInput.js');
  const g = new ThumbGestures();
  g.down(1, 200, 300, 0);
  g.move(1, 170, 300, 300);
  assert.ok(g.steer > 0.4 && g.steer < 0.6, 'moitié à gauche');
  g.move(1, 50, 300, 600);                 // ancre entraînée
  g.move(1, 80, 300, 900);
  assert.ok(g.steer < 0.6, 'l\'ancre a suivi : revenir un peu réduit tout de suite la direction');
  g.move(1, 82, 240, 960);
  assert.equal(g.take().jump, true);
  g.move(1, 82, 300, 1300);
  assert.equal(g.drift, true);
  g.move(1, 82, 250, 1600);
  assert.equal(g.drift, false);
  g.move(1, 20, 250, 1660);
  assert.equal(g.take().shove, 1, 'coup vers la gauche');
  g.down(2, 600, 300, 1700);
  assert.equal(g.take().item, true);
  g.up(1, 20, 250, 1800);
  assert.equal(g.steer, 0);
  g.down(3, 500, 300, 2000); g.up(3, 502, 301, 2100);
  assert.equal(g.take().item, true, 'tap bref seul = objet');
});
