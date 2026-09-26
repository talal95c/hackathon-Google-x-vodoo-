// Tests du kernel : il tourne sans navigateur ni Three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { Shop } from '../src/meta/Shop.js';
import { Profile } from '../src/meta/Profile.js';
import { MemoryStorage } from '../src/meta/Storage.js';
import { CHALLENGES } from '../src/content/challenges.js';
import { Input } from '../src/input/Input.js';

const idle = { steer: 0, drift: false, brake: false, jump: false };
const run = (game, seconds, intent = idle) => { for (let t = 0; t < seconds; t += 1 / 60) game.update(1 / 60, typeof intent === 'function' ? intent(game) : intent); };

// Pilote simple : reste au centre, contre la force centrifuge
const pilot = (g) => ({ ...idle, steer: Math.max(-1, Math.min(1, (-g.runner.x * 3 - g.runner.push) / 10)) });

test('tap bref = une parade ; glissement vers le haut = saut sans parade', () => {
  const handlers = {}, oldWindow = globalThis.window;
  globalThis.window = { innerWidth: 800 };
  try {
    const input = new Input({ addEventListener: (type, fn) => { handlers[type] = fn; } });
    const touch = (identifier, x, y) => ({ identifier, clientX: x, clientY: y });
    const event = (type, changedTouches, touches) => ({ type, changedTouches, touches, target: {}, preventDefault() {} });
    const start = touch(1, 200, 300);
    handlers.touchstart(event('touchstart', [start], [start]));
    handlers.touchend(event('touchend', [touch(1, 202, 302)], []));
    assert.equal(input.read(1 / 60).attack, true);
    assert.equal(input.read(1 / 60).attack, false);
    handlers.touchstart(event('touchstart', [start], [start]));
    handlers.touchmove(event('touchmove', [touch(1, 200, 220)], [start]));
    handlers.touchend(event('touchend', [touch(1, 200, 220)], []));
    const intent = input.read(1 / 60);
    assert.equal(intent.jump, true);
    assert.equal(intent.attack, false);
    handlers.touchstart(event('touchstart', [start], [start]));
    handlers.touchend(event('touchend', [touch(1, 200, 220)], []));
    const fastSwipe = input.read(1 / 60);
    assert.equal(fastSwipe.jump, true);
    assert.equal(fastSwipe.attack, false);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});

test('parade : cible violette proche uniquement, cooldown et récompense', () => {
  const g = new Game({ seed: 10 });
  g.start({ seed: 10 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  const far = g.spawn('parryBlock', g.runner.z + 14, g.runner.x);
  g.update(1 / 60, { ...idle, attack: true });
  assert.equal(far.alive, true);
  assert.equal(g.parries, 0);
  const near = g.spawn('parryBlock', g.runner.z + 3, g.runner.x);
  g.update(1 / 60, { ...idle, attack: true });
  assert.equal(near.alive, true, 'une deuxième attaque immédiate est bloquée');
  run(g, 0.55, pilot);
  const next = g.spawn('parryBlock', g.runner.z + 3, g.runner.x);
  g.update(1 / 60, { ...idle, attack: true });
  assert.equal(far.alive, false, 'la cible la plus proche est parée en priorité');
  assert.equal(next.alive, true);
  assert.equal(g.parries, 1);
  assert.equal(g.fever, 25);
  assert.ok(g.coins >= far.reward);
});

test('les pièces se ramassent plus largement que les obstacles ne frappent', () => {
  const g = new Game({ seed: 11 });
  g.start({ seed: 11 });
  const { z, x } = g.runner;
  const hazard = g.spawn('cactus', z, x + 1.8);
  const coin = g.spawn('coin', z, x + 1.8);
  assert.equal(hazard.overlapsRunner(), false);
  assert.equal(coin.overlapsRunner(), true);
});

test('frôler un obstacle sans le toucher déclenche un ralenti et remplit la Frénésie', () => {
  const g = new Game({ seed: 11 });
  g.start({ seed: 11 });
  for (const e of g.entities) e.destroy();
  g.entities = [];
  const events = [];
  g.on('runner:nearMiss', (e) => events.push(e));
  const hazard = g.spawn('cactus', g.runner.z + 4, g.runner.x + 1.1 + 0.85 * 0.8 + 0.3);
  const far = g.spawn('cactus', g.runner.z + 4, g.runner.x + 6);
  const lives = g.lives;
  for (let i = 0; i < 90 && g.timeWarp.left === 0; i++) g.update(1 / 60, idle);
  assert.equal(events.length, 1);
  assert.equal(events[0].entity, hazard);
  assert.ok(events[0].margin >= 0 && events[0].margin <= 0.9);
  assert.equal(g.lives, lives);
  assert.equal(g.fever, 8);
  assert.ok(g.timeWarp.left > 0 && g.timeWarp.scale < 1);
  const s = g.runner.z;
  g.update(0.1, idle);
  assert.ok(g.runner.z - s < g.runner.speed * 0.1 * 0.6, 'la simulation avance au ralenti');
  run(g, 1);
  assert.equal(events.length, 1, 'un seul frôlement par obstacle ; l’obstacle lointain ne compte pas');
  assert.equal(far.nearMissDone, true);
});

test('Frénésie : la collecte remplit une jauge temporaire, sans la recharger pendant son effet', () => {
  const g = new Game({ seed: 12 });
  g.start({ seed: 12 });
  const coin = g.spawn('goldCoin', g.runner.z, g.runner.x);
  coin.onContact(g.runner);
  assert.equal(g.coins >= 3, true);
  assert.equal(g.fever, 12);
  g.addFever(88);
  assert.equal(g.feverTime, 6);
  assert.equal(g.runner.smashes, true);
  const hazard = g.spawn('cactus', g.runner.z, g.runner.x);
  hazard.onContact(g.runner);
  assert.equal(hazard.alive, false);
  g.addFever(80);
  assert.equal(g.fever, 0);
  let ended = 0;
  g.on('fever:end', () => ended++);
  g.feverTime = 1 / 120;
  g.update(1 / 60, idle);
  assert.equal(ended, 1);
  assert.equal(g.runner.smashes, false);
  assert.equal(g.runner.isInvulnerable, false);
  g.start({ seed: 12 });
  assert.equal(g.feverTime, 0);
  assert.equal(g.fever, 0);
});

test('défis facultatifs : sélection conservée, seule la réussite crédite la récompense', () => {
  const profile = new Profile(new MemoryStorage());
  profile.selectChallenge('parrier');
  profile.selectChallenge('unknown');
  assert.equal(profile.data.challenge, 'parrier');
  const g = new Game({ seed: 13 });
  g.start({ seed: 13, challenge: profile.data.challenge });
  assert.equal(g.challengeProgress, 0);
  g.parries = 2;
  assert.equal(g.challengeProgress, 2);
  let result;
  g.on('game:over', (r) => { result = r; });
  for (let i = 0; i < 3; i++) { g.runner.invul = 0; g.runner.hurt({}); }
  assert.equal(result.challenge.complete, true);
  assert.equal(profile.recordRun(result).challengeReward, CHALLENGES[1].reward);
  assert.equal(profile.coins, result.coins + CHALLENGES[1].reward);
  g.start({ seed: 13, challenge: profile.data.challenge });
  for (let i = 0; i < 3; i++) { g.runner.invul = 0; g.runner.hurt({}); }
  assert.equal(result.challenge.complete, false);
  assert.equal(profile.recordRun(result).challengeReward, 0);
});

test('le choix de trajectoire propose une voie sûre et une voie dorée en bord de piste', () => {
  for (const seed of [14, 81]) {
    const g = new Game({ seed });
    g.track.ensure(700);
    const gold = g.entities.filter((e) => e.type === 'goldCoin');
    assert.ok(gold.length > 0);
    for (const e of gold) {
      const safe = g.entities.find((c) => c.type === 'coin' && c.s === e.s && Math.sign(c.d) === -Math.sign(e.d));
      assert.ok(safe, `voie sûre absente à ${e.s}`);
      assert.ok(Math.abs(e.d) > Math.abs(safe.d));
      assert.ok(Math.abs(e.d) < g.track.frame(e.s, {}).w / 2);
    }
  }
});

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
