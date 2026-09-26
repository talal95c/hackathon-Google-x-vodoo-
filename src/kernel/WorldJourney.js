import { TRACK } from './config.js';
import { ZONES } from '../content/zones.js';

// One guided leap between each layer of the computer. The cloud is the final,
// endless world: there is no portal looping back to the offline page.
export const WORLD_JUMP = { lead: 38, tail: 38, height: 17, gap: 27, safe: 66 };
export const worldIndex = s => Math.min(ZONES.length - 1, Math.floor(Math.max(0, s) / TRACK.zoneLength));
export function nearBoundary(s, radius) {
  const number = Math.round(s / TRACK.zoneLength);
  return number > 0 && number < ZONES.length && Math.abs(s - number * TRACK.zoneLength) < radius;
}
export const isWorldGap = s => nearBoundary(s, WORLD_JUMP.gap);
export const isWorldSafe = s => nearBoundary(s, WORLD_JUMP.safe);

export function intersectsWorldSafe(start, end) {
  for (let n = 1; n < ZONES.length; n++) {
    const boundary = n * TRACK.zoneLength;
    if (start < boundary + WORLD_JUMP.safe && end > boundary - WORLD_JUMP.safe) return true;
  }
  return false;
}
