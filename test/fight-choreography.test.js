import test from 'node:test';
import assert from 'node:assert/strict';
import { FighterMotion, finishPose, FINISH_CONTACT } from '../src/view/FightChoreography.js';

test('une rafale ne bloque pas le salto et les poses reviennent à zéro sans accumuler les rotations', () => {
  const motion = new FighterMotion(); motion.tap(6);
  let inverted = false;
  for (let frame = 0; frame < 180; frame++) {
    if (frame % 3 === 0) motion.tap(frame + 1);
    const pose = motion.update(1 / 60);
    inverted ||= pose.flip > 2 && pose.flip < 4 && pose.jump > 2;
    for (const key of ['jump', 'flip', 'forward', 'twist']) assert.ok(Number.isFinite(pose[key]));
    assert.ok(Math.abs(pose.flip) <= Math.PI * 2); assert.ok(Math.abs(pose.forward) < 1);
  }
  assert.ok(inverted, 'le dino doit réellement passer tête en bas en l’air');
  for (let i = 0; i < 120; i++) motion.update(1 / 60);
  const rest = motion.update(0);
  assert.equal(rest.active, false); assert.equal(rest.flip, 0); assert.equal(rest.jump, 0); assert.equal(rest.forward, 0);
});

test('finale : salto avant le contact, roulade du perdant après, puis les deux dinos reviennent sur leurs pieds', () => {
  assert.ok(finishPose(.55, true).jump > 2.5);
  assert.ok(finishPose(.55, true).flip > 2);
  assert.equal(finishPose(FINISH_CONTACT - .01, false).jump, 0);
  assert.ok(finishPose(FINISH_CONTACT + .4, false).jump > 1.4);
  for (const winner of [false, true]) {
    const final = finishPose(2.79, winner);
    assert.ok(Math.abs(final.jump) < 1e-8); assert.ok(Math.abs(Math.sin(final.flip)) < 1e-8);
    assert.ok(Math.abs(final.forward) < 1e-8); assert.equal(final.active, false);
  }
});
