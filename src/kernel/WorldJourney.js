import { TRACK } from './config.js';
import { ZONES } from '../content/zones.js';
import { Random } from './Random.js';

export const WORLD_JUMP = { lead: 38, tail: 38, height: 17, gap: 27, safe: 66 };
// Each lap uses all five universes. Independent streams keep views and gameplay
// from advancing each other's RNG; peers sharing a race seed see the same trip.
export function universeOrder(salt = 0) {
  const r = new Random(`universes-${salt}`), order = ZONES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
export const worldIndex = s => Math.floor(Math.max(0, s) / TRACK.zoneLength) % ZONES.length;
export function nearBoundary(s, radius) {
  const number = Math.round(s / TRACK.zoneLength);
  return number > 0 && Math.abs(s - number * TRACK.zoneLength) < radius;
}
export const isWorldGap = s => nearBoundary(s, WORLD_JUMP.gap);
export const isWorldSafe = s => nearBoundary(s, WORLD_JUMP.safe);
export function intersectsWorldSafe(start, end) {
  const first = Math.max(1, Math.floor((start - WORLD_JUMP.safe) / TRACK.zoneLength) + 1);
  return first * TRACK.zoneLength < end + WORLD_JUMP.safe;
}
export function boundariesIn(chunk) {
  const result = [];
  for (let n = Math.max(1, Math.ceil(chunk.s0 / TRACK.zoneLength)); n * TRACK.zoneLength < chunk.s1; n++) result.push(n * TRACK.zoneLength);
  return result;
}
