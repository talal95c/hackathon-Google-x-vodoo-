import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Skins } from '../src/kernel/Registry.js';
import { VOICES, voiceFor, voicePrompt, pickLine } from '../src/content/voices.js';

test('chaque skin a sa propre voix et son inventaire de répliques en anglais', () => {
  const names = new Set();
  for (const id of Skins.ids()) {
    const v = VOICES[id];
    assert.ok(v, `pas de voix pour le skin ${id}`);
    assert.ok(/^[A-Z][a-z]+$/.test(v.voiceName), `voix Gemini invalide pour ${id}`);
    assert.ok(!names.has(v.voiceName), `${id} partage sa voix avec un autre skin`);
    names.add(v.voiceName);
    assert.ok(v.style.startsWith('Say '), `style de ${id} : directive en anglais attendue`);
    assert.ok(v.lines.length >= 3, `${id} : au moins 3 répliques`);
    assert.equal(new Set(v.lines).size, v.lines.length, `${id} : répliques en double`);
    for (const l of v.lines) { assert.ok(/^[\x20-\x7E’]{2,14}$/.test(l), `${id} : réplique « ${l} » trop longue`); assert.ok(l.split(' ').length <= 3, `${id} : « ${l} » : 3 mots max`); }
  }
  assert.equal(voiceFor('skin-inconnu'), VOICES.classic);
});

test('les répliques sont coordonnées avec le type de skin', () => {
  assert.match(VOICES.vader.style, /dark lord|menacing/);
  assert.match(VOICES.mario.style, /Italian/);
  assert.match(VOICES.reggae.style, /reggae/);
  assert.match(VOICES.alligator.style, /swamp|hiss/);
  assert.match(VOICES.classic.style, /robotic|computer/);
});

test('prompt = style + réplique ; jamais deux fois la même réplique d\'affilée', () => {
  const v = VOICES.mario;
  assert.ok(voicePrompt(v, 'Wahoo!').endsWith(': Wahoo!') && voicePrompt(v, 'Wahoo!').startsWith(v.style));
  let last = pickLine(v);
  for (let i = 0; i < 50; i++) { const l = pickLine(v, last); assert.notEqual(l, last); assert.ok(v.lines.includes(l)); last = l; }
  assert.equal(pickLine({ lines: ['solo'] }, 'solo'), 'solo');
});

test('les clips pré-générés (public/voices/) couvrent toutes les répliques de tous les skins', async () => {
  const fs = await import('node:fs');
  const dir = new URL('../public/voices/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('index.json', dir), 'utf8'));
  for (const [id, v] of Object.entries(VOICES)) {
    const entry = manifest[id];
    assert.ok(entry, `${id} : pas dans public/voices/index.json (npm run voices:gen)`);
    assert.equal(entry.voiceName, v.voiceName, `${id} : voix changée, régénérer (npm run voices:gen ${id} -- --force)`);
    for (const line of v.lines) {
      const clip = entry.lines.find((l) => l.text === line);
      assert.ok(clip, `${id} « ${line} » : clip manquant (npm run voices:gen)`);
      assert.ok(fs.existsSync(new URL(clip.file, dir)), `${id} « ${line} » : fichier ${clip.file} absent`);
      assert.ok(clip.seconds <= 2, `${id} « ${line} » : ${clip.seconds} s, trop long pour le jeu`);
    }
  }
});
