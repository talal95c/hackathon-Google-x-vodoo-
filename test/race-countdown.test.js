import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceCountdown } from '../src/ui/RaceCountdown.js';

function clock() {
  let now = 0, serial = 0;
  const timers = new Map(), steps = [], starts = [];
  const countdown = new RaceCountdown({
    now: () => now,
    setTimer: (fn, ms) => { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer: id => timers.delete(id),
    onStep: step => steps.push(step),
  });
  const advance = (ms, suspended = false) => {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = suspended ? end : next[1].at;
      timers.delete(next[0]); next[1].fn();
    }
    now = end;
  };
  return { countdown, steps, starts, advance, go: () => starts.push(now) };
}

test('multiplayer start: 3, 2, 1, GO at the network deadline, with controls unlocked at GO', () => {
  const { countdown, steps, starts, advance, go } = clock();
  countdown.start(3500, go);
  assert.equal(countdown.running, true);
  advance(3499);
  assert.deepEqual(steps, ['ready', 3, 2, 1]);
  assert.deepEqual(starts, []);
  advance(1);
  assert.deepEqual(starts, [3500]);
  assert.equal(steps.at(-1), 0);
  assert.equal(countdown.running, false);
  advance(850);
  assert.equal(steps.at(-1), null);
  assert.deepEqual(starts, [3500]);
});

test('leaving the room cancels the pending start and its signals', () => {
  const { countdown, steps, starts, advance, go } = clock();
  countdown.start(3500, go); advance(1600); countdown.cancel();
  const stopped = [...steps]; advance(10000);
  assert.equal(countdown.running, false);
  assert.deepEqual(steps, stopped);
  assert.deepEqual(starts, []);
});

test('a replacement countdown cannot launch the previous race or hide the new countdown', () => {
  const { countdown, starts, advance, go } = clock();
  countdown.start(3500, () => assert.fail('old race started'));
  advance(2000); countdown.start(3500, go); advance(3500);
  assert.deepEqual(starts, [5500]);
  countdown.start(3500, go); advance(1000);
  assert.equal(countdown.running, true);
  advance(2500); assert.deepEqual(starts, [5500, 9000]);
});

test('a throttled tab skips expired ticks and starts once, without a burst of queued sounds', () => {
  const { countdown, steps, starts, advance, go } = clock();
  countdown.start(3500, go); advance(6000, true);
  assert.deepEqual(steps, ['ready', 0]);
  assert.deepEqual(starts, [6000]);
  advance(10000); assert.deepEqual(starts, [6000]);
});
