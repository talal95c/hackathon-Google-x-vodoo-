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
