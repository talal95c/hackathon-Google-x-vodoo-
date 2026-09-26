import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Skins, MusicThemes } from '../src/kernel/Registry.js';
import { ZONES } from '../src/content/zones.js';
import { Profile } from '../src/meta/Profile.js';
import { Shop } from '../src/meta/Shop.js';
import { MemoryStorage } from '../src/meta/Storage.js';
import { applyContent, seedProfile, validatePack, zonePalette } from '../src/brand/pack.js';
import bnw from '../src/brand/packs/bnw.json' with { type: 'json' };

test('marque : le jeu principal est intact tant qu’aucun pack n’est appliqué', () => {
  assert.equal(ZONES[0].name, 'DÉSERT HORS LIGNE');
  assert.ok(!Skins.has('brand-bnw'));
  assert.equal(new Profile(new MemoryStorage()).data.skin, 'reggae');
});

test('marque : le pack BNW est valide et convertit les couleurs', () => {
  assert.deepEqual(validatePack(bnw), []);
  assert.deepEqual(validatePack({ id: 'Bad Id' }), ['id must be lowercase letters, digits or dashes', 'name is required']);
  assert.deepEqual(zonePalette({ sky: '#143852', text: '#ffcc40', clouds: false }), { sky: 0x143852, text: '#ffcc40', clouds: false });
});

test('marque : BNW ajoute skin + musique et renomme les mondes, sauvegarde séparée', () => {
  const zones = structuredClone(ZONES);
  const res = applyContent(bnw, { Skins, MusicThemes, zones });
  assert.equal(Skins.get(res.skin).theme, res.theme);
  assert.equal(MusicThemes.get(res.theme).bpm, 100);
  assert.equal(zones[0].name, 'RUE DES SMASHES');
  assert.equal(zones[0].palette.edge, 0x143852);
  assert.equal(zones[0].id, 'offline', 'les règles de spawn restent celles du jeu principal');
  assert.deepEqual(zones[0].spawns, ZONES[0].spawns);

  const storage = new MemoryStorage();
  seedProfile(storage, bnw);
  const profile = new Profile(storage, res.profileKey);
  assert.equal(profile.data.skin, 'brand-bnw');
  assert.equal(new Shop(profile).prepareRun().theme, 'brand-bnw');
  assert.equal(new Profile(storage).data.skin, 'reggae', 'la partie principale ne voit pas la marque');
  assert.doesNotThrow(() => applyContent(bnw, { Skins, MusicThemes, zones }), 'réappliquer est idempotent');
});
