import { GAME } from './config.js';

// Le curseur géant : avance un peu moins vite que le dino, ne se laisse jamais distancer.
export class Chaser {
  reset(runnerS) { this.s = runnerS - GAME.chaserStartGap; }

  update(dt, runnerS, cruise) {
    this.s = Math.max(this.s + cruise * GAME.chaserSpeedFactor * dt, runnerS - GAME.chaserMaxGap);
  }

  gap(runnerS) { return runnerS - this.s; }
  // 0 = loin, 1 = sur le dino
  danger(runnerS) { return 1 - Math.min(1, this.gap(runnerS) / GAME.chaserMaxGap); }
}
