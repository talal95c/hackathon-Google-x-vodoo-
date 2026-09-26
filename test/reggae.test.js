import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Profile } from '../src/meta/Profile.js';
import { Shop } from '../src/meta/Shop.js';
import { MemoryStorage } from '../src/meta/Storage.js';

test('Riddim : le thème inclus reste disponible sur plusieurs parties', () => {
  const profile = new Profile(new MemoryStorage());
  const shop = new Shop(profile);
  assert.equal(profile.data.skin, 'reggae');
  assert.equal(shop.prepareRun().theme, 'reggae');
  assert.equal(shop.prepareRun().theme, 'reggae');
  assert.equal(profile.coins, 0);
  profile.selectSkin('classic');
  assert.equal(shop.prepareRun().theme, 'techno', 'le bonus musical appartient au dino reggae');
});

test('Riddim : une ancienne sauvegarde garde ses achats et reçoit le nouveau dino', () => {
  const storage = new MemoryStorage();
  storage.save('dino-escape-profile', {
    version: 1, coins: 750, best: 8900, runs: 12, skins: ['classic', 'neon'],
    skin: 'neon', music: { reggae: 2 }, theme: 'reggae', upgrades: { 'upgrade:magnet': 1 },
  });
  const profile = new Profile(storage);
  assert.ok(profile.ownsSkin('reggae'));
  assert.equal(profile.data.skin, 'neon');
  assert.equal(profile.coins, 750);
  assert.equal(profile.data.best, 8900);
  assert.equal(profile.musicCount('reggae'), 2);
  assert.equal(profile.upgradeLevel('upgrade:magnet'), 1);
  profile.selectSkin('reggae');
  new Shop(profile).prepareRun();
  assert.equal(profile.data.music.reggae, 2, 'le thème inclus ne consomme pas les achats existants');
  const restored = new Profile(storage);
  assert.equal(restored.data.skin, 'reggae');
  assert.equal(restored.data.skins.filter((s) => s === 'reggae').length, 1);
});
