import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/input/Input.js';

const setup = () => {
  const target = new EventTarget();
  let t = 0;
  const input = new Input(target, { now: () => t, width: () => 400 });
  const send = (type, id, x, y, dt = 16) => {
    t += dt;
    const e = new Event(type, { cancelable: true });
    const touch = { identifier: id, clientX: x, clientY: y, target: null };
    e.changedTouches = [touch];
    target.dispatchEvent(e);
  };
  return { input, send };
};
const settle = (input) => { let r; for (let i = 0; i < 30; i++) r = input.read(1 / 60); return r; };

test('tactile : glisser dirige de façon analogique, doigt posé = courir', () => {
  const { input, send } = setup();
  send('touchstart', 1, 200, 500);
  let r = settle(input);
  assert.equal(r.throttle, 1);
  assert.ok(Math.abs(r.steer) < 0.01);
  send('touchmove', 1, 170, 500);
  r = settle(input);
  assert.ok(r.steer > 0.3 && r.steer < 0.8, `gauche partielle ${r.steer}`);
  send('touchmove', 1, 20, 500);
  assert.ok(settle(input).steer > 0.99);
  // ancre flottante : revenir un peu vers la droite braque aussitôt à droite
  send('touchmove', 1, 20 + 52 * 2, 500);
  assert.ok(settle(input).steer < -0.9);
  send('touchend', 1, 124, 500);
  r = settle(input);
  assert.equal(r.throttle, 0);
});

test('tactile : balayage haut = un saut, bas = glissade tenue, lent = rien', () => {
  const { input, send } = setup();
  send('touchstart', 1, 200, 500);
  send('touchmove', 1, 202, 480);
  send('touchmove', 1, 203, 450);
  assert.equal(input.read(1 / 60).jump, true);
  assert.equal(input.read(1 / 60).jump, false);
  send('touchmove', 1, 203, 500);
  let r = input.read(1 / 60);
  assert.equal(r.drift, true);
  assert.equal(r.jump, false);
  send('touchend', 1, 203, 500);
  send('touchstart', 2, 200, 500);
  for (let i = 1; i <= 10; i++) send('touchmove', 2, 200, 500 - i * 5, 100);
  r = input.read(1 / 60);
  assert.equal(r.jump, false);
  assert.equal(r.drift, false);
});

test('tactile : deuxième doigt = glissade, le doigt restant reprend la direction', () => {
  const { input, send } = setup();
  send('touchstart', 1, 200, 500);
  send('touchstart', 2, 300, 500);
  assert.equal(input.read(1 / 60).drift, true);
  send('touchend', 1, 200, 500);
  send('touchmove', 2, 250, 500);
  const r = settle(input);
  assert.equal(r.drift, false);
  assert.ok(r.steer > 0.5);
});

test('tactile : un seul déplacement lent après une pause ne saute pas', () => {
  const { input, send } = setup();
  send('touchstart', 1, 200, 500);
  send('touchmove', 1, 200, 460, 300);
  assert.equal(input.read(1 / 60).jump, false);
  send('touchmove', 1, 200, 420, 16);
  assert.equal(input.read(1 / 60).jump, true);
});

test('tactile : faire demi-tour avant la butée inverse la direction', () => {
  const { input, send } = setup();
  send('touchstart', 1, 200, 500);
  send('touchmove', 1, 148, 500);
  assert.ok(settle(input).steer > 0.9);
  send('touchmove', 1, 178, 500);
  assert.ok(settle(input).steer < -0.4);
  send('touchmove', 1, 176, 500); // tremblement du pouce : pas de nouvel aller-retour
  assert.ok(settle(input).steer < -0.3);
});
