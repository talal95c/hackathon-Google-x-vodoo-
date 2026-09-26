import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpImpulse, shoveTarget, roomCode, FIGHT } from '../src/net/rules.js';

test('contact : on est repoussé loin de l\'autre, et celui qui fonce pousse plus fort', () => {
  const me = { s: 100, d: 0, y: 0, lat: 0 };
  assert.equal(bumpImpulse(me, { s: 100, d: 5, y: 0, lat: 0 }), 0, 'trop loin : pas de contact');
  const soft = bumpImpulse(me, { s: 100.5, d: 1, y: 0, lat: 0 });
  assert.ok(soft < 0, 'l\'autre est à gauche → je suis poussé à droite');
  const rammed = bumpImpulse(me, { s: 100.5, d: 1, y: 0, lat: -15 }); // il fonce vers moi
  assert.ok(Math.abs(rammed) > Math.abs(soft) + 10);
  const iRam = bumpImpulse({ ...me, lat: 15 }, { s: 100.5, d: 1, y: 0, lat: 0 });
  assert.ok(Math.abs(iRam) <= FIGHT.bumpBase + 1e-9, 'le fonceur ne subit que la poussée de base');
  assert.equal(bumpImpulse(me, { s: 100, d: 1, y: 3, lat: 0 }), 0, 'sauter par-dessus évite le contact');
});

test('coup d\'épaule : vise le rival vivant le plus proche, poussé loin de moi', () => {
  const me = { s: 50, d: 0 };
  const t = shoveTarget(me, [
    { id: 'a', s: 53, d: 3, alive: true },
    { id: 'b', s: 51, d: -1.5, alive: true },
    { id: 'c', s: 50, d: 0.5, alive: false },
    { id: 'd', s: 70, d: 0, alive: true },
  ]);
  assert.equal(t.id, 'b');
  assert.equal(t.dir, -1);
  assert.equal(shoveTarget(me, [{ id: 'x', s: 80, d: 0, alive: true }]), null);
});

test('code de partie : 5 caractères lisibles', () => {
  const c = roomCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{5}$/);
});

// --- Intégration : deux joueurs reliés par un faux réseau en mémoire
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { Profile } from '../src/meta/Profile.js';
import { MemoryStorage } from '../src/meta/Storage.js';
import { Multiplayer } from '../src/net/Multiplayer.js';

function fakeHub() {
  const members = new Map(); // id → { handlers, callbacks }
  let n = 0;
  return async (room, cb) => {
    const selfId = `p${++n}`;
    const me = { handlers: new Map(), cb };
    members.set(selfId, me);
    setTimeout(() => { for (const [id, m] of members) if (id !== selfId) { m.cb.onPeerJoin?.(selfId); cb.onPeerJoin?.(id); } }, 0); // asynchrone, comme Trystero
    return {
      selfId, peers: new Set(),
      channel: (name) => ({
        send: (data, to) => { for (const [id, m] of members) if (id !== selfId && (!to || to === id)) m.handlers.get(name)?.(structuredClone(data), selfId); },
        on: (fn) => me.handlers.set(name, fn),
      }),
      leave: () => members.delete(selfId),
    };
  };
}

async function duo() {
  const connectFn = fakeHub();
  const mk = () => { const g = new Game({ seed: 1 }); return { g, mp: new Multiplayer(g, new Profile(new MemoryStorage()), { connectFn }) }; };
  const A = mk(), B = mk();
  let started = 0;
  for (const P of [A, B]) P.mp.on('start', ({ seed, lane }) => { P.g.start({ seed }); P.g.runner.x = lane; started++; });
  const code = await A.mp.create();
  await B.mp.join(code);
  await new Promise((r) => setTimeout(r, 5)); // présentations échangées
  A.mp.startRace();
  await new Promise((r) => setTimeout(r, 10));
  for (const P of [A, B]) { for (const e of P.g.entities) e.destroy(); P.g.entities = []; }
  return { A, B, started };
}
const still = { steer: 0, drift: false, brake: false, jump: false, shove: false };
const tick = (P, intent = still) => { P.g.update(1 / 60, intent); P.mp.update(1 / 60, intent); };

test('multijoueur : les deux joueurs partent avec la même graine, sur des lignes différentes, et se voient', async () => {
  const { A, B, started } = await duo();
  assert.equal(started, 2);
  assert.equal(A.g.seed, B.g.seed);
  assert.ok(Math.abs(A.g.runner.x - B.g.runner.x) > 2, 'pas de collision au départ');
  for (let i = 0; i < 10; i++) { tick(A); tick(B); }
  const seen = [...A.mp.peers.values()][0].view;
  assert.ok(seen && Math.abs(seen.s - B.g.runner.z) < 3, 'A voit B à sa position');
});

test('multijoueur : un contact pousse les DEUX joueurs, chacun de son côté', async () => {
  const { A, B } = await duo();
  const knocks = { A: 0, B: 0 };
  A.g.on('runner:knocked', () => knocks.A++);
  B.g.on('runner:knocked', () => knocks.B++);
  for (let i = 0; i < 5; i++) { tick(A); tick(B); }
  // collés côte à côte à la même distance ; A fonce latéralement vers B
  // côte à côte (hors contact) le temps que chacun voie l'autre à sa vraie place…
  B.g.runner.z = A.g.runner.z;
  for (let i = 0; i < 30; i++) { A.g.runner.x = 2.2; B.g.runner.x = -0.5; tick(B); tick(A); }
  knocks.A = 0; knocks.B = 0;
  // …puis A fonce latéralement sur B
  for (let i = 0; i < 12; i++) { A.g.runner.latV = -14; tick(B); tick(A); }
  assert.ok(knocks.A >= 1 && knocks.B >= 1, `poussées : A ${knocks.A}, B ${knocks.B}`);
  assert.ok(B.g.runner.knockV < -5, 'B (percuté) est éjecté vers la droite');
});

test('multijoueur : le coup d\'épaule touche le rival à portée', async () => {
  const { A, B } = await duo();
  let shoved = 0;
  B.g.on('mp:shoved', () => shoved++);
  for (let i = 0; i < 5; i++) { tick(A); tick(B); }
  B.g.runner.z = A.g.runner.z; A.g.runner.x = 2.5; B.g.runner.x = -1;
  for (let i = 0; i < 3; i++) { tick(B); tick(A); }
  tick(A, { ...still, shove: true });
  assert.equal(shoved, 1);
  assert.ok(B.g.runner.knockV < -20, 'B éjecté loin de A');
});

// --- PNJ du mode solo
import { Bots } from '../src/bots/Bots.js';

test('PNJ : ils courent avec le joueur et restent dans la course', () => {
  const g = new Game({ seed: 8 });
  g.start({ seed: 8 });
  const bots = new Bots(g, 3);
  bots.start();
  const pilot = (gg) => ({ steer: Math.max(-1, Math.min(1, (-gg.runner.x * 3 - gg.runner.push) / 6)), throttle: 1, drift: false, brake: false, jump: false });
  for (let t = 0; t < 20 && g.state === 'playing'; t += 1 / 60) { g.runner.invul = 99; const i = pilot(g); g.update(1 / 60, i); bots.update(1 / 60, i); }
  const alive = bots.list.filter((b) => b.alive);
  assert.ok(alive.length >= 1, 'au moins un PNJ encore en course');
  for (const b of alive) assert.ok(Math.abs(b.s - g.runner.z) < 60, `${b.name} reste à portée (${Math.round(b.s - g.runner.z)} m)`);
});

test('PNJ : le coup d\'épaule du joueur peut les éjecter de la route', () => {
  const g = new Game({ seed: 8 });
  g.start({ seed: 8 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  const bots = new Bots(g, 1);
  bots.start();
  const b = bots.list[0];
  b.s = g.runner.z; b.d = -5; b.aggression = 0; g.runner.x = -3; // à mi-chemin entre le centre et le bord
  const idle = { steer: 0, throttle: 1, drift: false, brake: false, jump: false };
  g.update(1 / 60, idle); bots.update(1 / 60, { ...idle, shove: true });
  for (let t = 0; t < 2 && b.alive; t += 1 / 60) { g.runner.invul = 99; g.update(1 / 60, idle); bots.update(1 / 60, idle); }
  assert.equal(b.alive, false, 'éjecté de la route');
});

// --- La musique réagit au match
import { MatchMood } from '../src/audio/music/MatchMood.js';

test('ambiance du match : bagarre, danger et triomphe montent puis retombent en douceur', () => {
  const g = new Game({ seed: 5 });
  g.start({ seed: 5 });
  const bots = new Bots(g, 1); bots.start();
  const mood = new MatchMood(g, () => bots);
  const step = (sec) => { for (let t = 0; t < sec; t += 1 / 60) mood.update(1 / 60); };
  bots.list[0].s = 999; step(1);
  assert.ok(mood.fight < 0.05, 'personne autour : calme');
  bots.list[0].s = g.runner.z; bots.list[0].d = g.runner.x + 2;
  g.emit('runner:knocked', { lateral: 20 });
  step(1);
  assert.ok(mood.fight > 0.5, `bagarre : ${mood.fight.toFixed(2)}`);
  bots.list[0].s = 999; step(12);
  assert.ok(mood.fight < 0.3, `retombe : ${mood.fight.toFixed(2)}`);
  g.lives = 1; step(3);
  assert.ok(mood.danger > 0.8, 'dernière vie : danger');
  g.emit('bot:out', { bot: 'Rex' }); step(0.8);
  assert.ok(mood.triumph > 0.6, 'élimination : triomphe');
});

test('PNJ : tous différents entre eux et différents du joueur, et ça change d\'une partie à l\'autre', () => {
  const skins = ['classic', 'neon', 'gold', 'reggae', 'vader', 'drift', 'mario', 'alligator'];
  const combos = new Set();
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = new Game({ seed }); g.start({ seed });
    const bots = new Bots(g, 3); bots.start(skins, 'reggae');
    const used = bots.list.map((b) => b.skin);
    assert.equal(new Set(used).size, 3, `skins en double : ${used}`);
    assert.ok(!used.includes('reggae'), 'jamais le skin du joueur');
    combos.add(used.join(','));
  }
  assert.ok(combos.size > 1, 'les PNJ changent d\'une partie à l\'autre');
});
