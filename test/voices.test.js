// Réactions vocales : règles de déclenchement (sans audio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { VoiceDirector, VOICE } from '../src/audio/VoiceDirector.js';
import { CHARACTERS } from '../scripts/voices/characters.js';

const manifest = { lines: Object.fromEntries(Object.entries(CHARACTERS).map(([id, c]) => [id,
  Object.fromEntries(Object.entries(c.lines).map(([ev, lines]) => [ev, lines.map((text, i) => ({ file: `${id}/${ev}_${i}.mp3`, text }))]))])) };

const setup = (opts = {}) => {
  const game = new Game({ seed: 7 });
  const played = [];
  const player = { play: (file) => { played.push(file); return 1; }, stop() {} };
  const voices = new VoiceDirector(game, { player, random: () => 0.99, ...opts });
  voices.setManifest(manifest);
  return { game, voices, played };
};

test('répliques courtes et présentes pour chaque perso', () => {
  for (const [id, c] of Object.entries(CHARACTERS)) {
    for (const [ev, lines] of Object.entries(c.lines)) {
      assert.ok(lines.length >= 2, `${id}.${ev}`);
      for (const l of lines) assert.ok(l.length < 100, `${id}.${ev} trop long : ${l}`);
    }
  }
});

test('la voix suit le skin, repli sur le dino classique', () => {
  const { game, played } = setup();
  game.start({ skin: 'gold' });
  assert.match(played[0], /^gold\/start_/);
  const other = setup();
  other.game.start({ skin: 'inconnu' });
  assert.match(other.played[0], /^classic\/start_/);
});

test('cooldown : pas de rafale, mais les réactions fortes passent', () => {
  let rnd = 0.99;
  const { game, voices, played } = setup({ random: () => rnd });
  game.start({ skin: 'reggae' });
  voices.update(0.3);
  game.emit('runner:parry', { total: 1 });
  assert.equal(played.length, 1, 'parade ignorée pendant la réplique de départ');
  game.emit('life:lost', { lives: 1, reason: 'hit' });
  assert.match(played.at(-1), /^reggae\/lastLife_/);
  voices.update(VOICE.cooldown + 1);
  rnd = 0.1;
  game.emit('runner:parry', { total: 2 });
  assert.match(played.at(-1), /^reggae\/parry_/);
});

test('jamais deux fois la même réplique de suite', () => {
  const { game, voices, played } = setup({ random: () => 0 });
  game.start({ skin: 'neon' });
  for (let i = 0; i < 4; i++) { voices.update(VOICE.eventCooldown + 1); game.emit('fever:start', {}); }
  const fevers = played.filter((f) => f.includes('/fever_'));
  for (let i = 1; i < fevers.length; i++) assert.notEqual(fevers[i], fevers[i - 1]);
});

test('record battu en pleine course, curseur qui ricane quand il attrape', () => {
  const { game, voices, played } = setup({ getBest: () => 10 });
  game.start({ skin: 'classic' });
  voices.update(3);
  game.coins = 50;
  voices.update(0.1);
  assert.match(played.at(-1), /^classic\/record_/);
  game.emit('game:over', { reason: 'caught', score: 999 });
  assert.match(played.at(-1), /^cursor\/caught_/);
  voices.update(2);
  assert.match(played.at(-1), /^classic\/overRecord_/);
});

test('première partie : fin sur un record, et le record différé est retenté', () => {
  const { game, voices, played } = setup();
  game.start({ skin: 'neon' });
  game.emit('game:over', { reason: 'hit', score: 120 });
  voices.update(0.5);
  assert.match(played.at(-1), /^neon\/overRecord_/);

  const b = setup({ getBest: () => 10 });
  b.game.start({ skin: 'gold' });
  b.voices.update(3);
  b.voices.say('fall', { force: true });
  b.game.coins = 50;
  b.voices.update(0.1);
  assert.match(b.played.at(-1), /^gold\/fall_/);
  b.voices.update(1.5);
  assert.match(b.played.at(-1), /^gold\/record_/);
});

test('une relance annule les répliques différées de la partie précédente', () => {
  const { game, voices, played } = setup();
  game.start({ skin: 'classic' });
  game.emit('game:over', { reason: 'caught', score: 0 });
  game.start({ skin: 'classic' });
  const n = played.length;
  voices.update(2);
  assert.ok(played.slice(n).every((f) => !/over/.test(f)));
});

test('manifest arrivé après le départ : la réplique de départ est quand même jouée', () => {
  const game = new Game({ seed: 7 });
  const played = [];
  const voices = new VoiceDirector(game, { player: { play: (f) => { played.push(f); return 1; }, stop() {} }, random: () => 0.99 });
  game.start({ skin: 'reggae' });
  voices.update(0.3);
  voices.setManifest(manifest);
  assert.match(played[0], /^reggae\/start_/);
});
