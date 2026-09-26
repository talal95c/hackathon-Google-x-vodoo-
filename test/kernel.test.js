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
  run(g, 90, (gg) => { gg.runner.invul = 1e9; return idle; }); // invincible : on ne teste que la chute
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

test('paliers de vitesse : appliqués dès la distance atteinte (sans attendre la musique)', () => {
  const g = new Game({ seed: 4 });
  g.start({ seed: 4 });
  const tempos = [];
  g.on('tempo', (t) => tempos.push(t));
  g.runner.z = 460; g.sMax = 460; g.chaser.reset(460);
  run(g, 0.2, pilot);
  assert.equal(tempos.at(-1)?.level, 1);
  assert.ok(Math.abs(g.runner.cruise - 34 * 1.1) < 1e-9, `cruise ${g.runner.cruise}`);
});

test('la foulée suit la vitesse, pas la musique', () => {
  const g = new Game({ seed: 2 });
  g.start({ seed: 2 });
  let steps = 0;
  g.on('runner:step', () => steps++);
  g.beat.setBpm(60);  // un tempo absurde ne doit rien changer
  run(g, 2, pilot);
  const slow = steps; steps = 0;
  g.beat.setBpm(200);
  run(g, 2, pilot);
  assert.ok(Math.abs(steps - slow) <= 3, `${slow} puis ${steps} pas`);
});

test('la glissade est limitée par une jauge', () => {
  const g = new Game({ seed: 4 });
  g.start({ seed: 4 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  const r = g.runner;
  let slid = 0;
  for (let t = 0; t < 4; t += 1 / 60) {
    g.update(1 / 60, { steer: r.x > 2 ? -1 : 1, drift: true, brake: false, jump: false });
    if (r.drifting) slid += 1 / 60;
    if (g.state !== 'playing') break;
  }
  assert.ok(slid > 0.5 && slid < 1.8, `glissade tenue ${slid.toFixed(2)} s malgré SHIFT maintenu`);
});

test('virages durs : présents de temps en temps, jouables, sans obstacle dedans', () => {
  const g = new Game({ seed: 11 });
  g.start({ seed: 11 });
  g.track.ensure(6000);
  const turns = g.track.hardTurns;
  assert.ok(turns.length >= 3, `${turns.length} virages durs sur 6 km`);
  for (let i = 1; i < turns.length; i++) assert.ok(turns[i].s - turns[i - 1].s >= 250, 'espacés d\'au moins 250 m');
  const { Z } = g.track;
  for (let i = 1; i < Z.length; i++) assert.ok(Z[i] > Z[i - 1], 'la route ne revient jamais en arrière');
  // pas d'obstacle dans le premier virage dur
  const t = turns[0];
  g.runner.z = t.s - 200; g.sMax = g.runner.z; g.chaser.reset(g.runner.z);
  run(g, 1, pilot);
  assert.ok(!g.entities.some((e) => e.kind === 'enemy' && e.s >= t.s - 20 && e.s <= t.end), 'aucun ennemi dans le virage');
});

test('même graine = même route, même si on génère la route loin devant avant de jouer', () => {
  const a = new Game({ seed: 12 }); a.start({ seed: 12 }); a.track.ensure(3000);
  const b = new Game({ seed: 12 }); b.start({ seed: 12 });
  b.runner.z = 1200; b.sMax = 1200; b.chaser.reset(1200);
  run(b, 1, pilot); // b peuple des morceaux au fil de l'eau
  b.track.ensure(3000);
  assert.deepEqual(a.track.X.slice(0, 1400), b.track.X.slice(0, 1400));
});

test('virages durs : il faut tenir la direction (lâcher = sortir), jouable au clavier avec retard', () => {
  const tally = { hold: 0, late: 0, release: 0 }; let n = 0;
  for (const seed of [11, 12, 13, 14]) {
    const g = new Game({ seed }); g.start({ seed }); g.track.ensure(4000);
    for (const t of g.track.hardTurns.slice(0, 3)) {
      for (const mode of ['hold', 'late', 'release']) {
        const h = new Game({ seed }); h.start({ seed }); const r = h.runner;
        r.z = t.s - 60; h.sMax = r.z; h.chaser.reset(r.z); r.speed = 34 * h.tempoAt(r.z).ratio;
        let inTurn = 0, key = 0;
        for (let k = 0; k < 400 && h.state === 'playing' && r.z < t.end + 30; k++) {
          r.invul = 99;
          let target = Math.sign(Math.round((-r.x * 3 - r.push) / 6)); // clavier en tout ou rien
          if (r.manual) {
            inTurn += 1 / 60;
            const dir = Math.sign(h.track.frame(r.z).k);
            if (mode === 'release') target = 0;
            else if (mode === 'late' && inTurn < 0.25) target = 0;           // réagit 0,25 s en retard
            else target = r.x * dir > 5 ? 0 : dir;                          // maintient la touche du virage
          }
          key += (target - key) * Math.min(1, 10 / 60);
          h.update(1 / 60, { steer: key, drift: false, brake: false, jump: false });
        }
        if (h.state === 'playing') tally[mode]++;
      }
      n++;
    }
  }
  assert.equal(tally.hold, n, `en maintenant : ${tally.hold}/${n}`);
  assert.ok(tally.late >= n - 1, `avec 0,25 s de retard : ${tally.late}/${n}`);
  assert.ok(tally.release <= n / 3, `en lâchant : ${tally.release}/${n} passés`);
});

test('les ennemis qui foncent avancent vers le dino ; le ptérodactyle ne se saute pas', () => {
  const g = new Game({ seed: 3 });
  g.start({ seed: 3 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  const r = g.runner;
  const p = g.spawn('ptero', r.z + 60, r.x);
  const s0 = p.s;
  let hit = false;
  g.on('runner:hit', () => { hit = true; });
  // on saute juste avant l'impact : le ptérodactyle vole trop haut pour passer dessous ou dessus
  for (let t = 0; t < 2 && !hit; t += 1 / 60) {
    const jump = p.alive && p.s - r.z < 7 && p.s - r.z > 5;
    g.update(1 / 60, { steer: 0, drift: false, brake: false, jump });
  }
  assert.ok(s0 - p.s > 5 || !p.alive, 'le ptérodactyle a avancé');
  assert.ok(hit, 'sauter ne suffit pas : il faut esquiver');
});

test('un coup latéral pousse le dino puis s\'amortit (et peut le faire tomber)', () => {
  const g = new Game({ seed: 2 });
  g.start({ seed: 2 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  const r = g.runner, x0 = r.x;
  r.knock(20);
  for (let t = 0; t < 0.3; t += 1 / 60) g.update(1 / 60, { steer: 0, drift: false, brake: false, jump: false });
  assert.ok(r.x - x0 > 3, `poussé de ${(r.x - x0).toFixed(1)} m`);
  assert.ok(Math.abs(r.knockV) < 8, 'amorti');
  r.knock(60, { stumble: 0.4 });
  let fell = false;
  for (let t = 0; t < 2 && !fell; t += 1 / 60) { g.update(1 / 60, { steer: 0, drift: false, brake: false, jump: false }); fell = g.state !== 'playing'; }
  assert.ok(fell, 'un gros coup au bord fait tomber');
});

test('le dino ne court que si on le demande : il ralentit puis s\'arrête', () => {
  const g = new Game({ seed: 2 });
  g.start({ seed: 2 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  const r = g.runner, go = { steer: 0, drift: false, brake: false, jump: false };
  for (let t = 0; t < 2; t += 1 / 60) g.update(1 / 60, { ...go, throttle: 1 });
  assert.ok(r.speed > 30, `court : ${r.speed.toFixed(1)} m/s`);
  for (let t = 0; t < 3; t += 1 / 60) g.update(1 / 60, { ...go, throttle: 0 });
  assert.ok(r.speed < 1.5, `arrêté : ${r.speed.toFixed(1)} m/s`);
  const z = r.z;
  for (let t = 0; t < 1; t += 1 / 60) g.update(1 / 60, { ...go, throttle: 0 });
  assert.ok(r.z - z < 1.5, 'ne bouge presque plus');
});
