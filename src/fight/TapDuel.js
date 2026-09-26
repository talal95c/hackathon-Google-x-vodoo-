export const CLUB = Object.freeze({
  firstAt: 700, every: 700, approachAt: 180, introMs: 1800, tapMs: 3000, minTapMs: 50,
  resultMs: 2800, networkGraceMs: 2500, timeoutMs: 15000,
  stealMax: 20, stealShare: .5, stunSeconds: 1, slowSeconds: 5, slowFactor: .65,
});

// Horloge monotone, indépendante du framerate : un onglet ralenti ne rallonge pas le duel.
export class TapDuel {
  constructor(fighters, startedAt) {
    this.fighters = fighters.map(f => ({ ...f, coins: Math.max(0, Math.floor(f.coins || 0)) }));
    this.startedAt = startedAt;
    this.counts = [0, 0]; this.lastTap = [-Infinity, -Infinity]; this.finished = [false, false];
  }
  phase(now) {
    const t = now - this.startedAt;
    return t < CLUB.introMs ? 'intro' : t < CLUB.introMs + CLUB.tapMs ? 'tapping' : 'judging';
  }
  remaining(now) { return Math.min(CLUB.tapMs, Math.max(0, CLUB.tapMs - (now - this.startedAt - CLUB.introMs))); }
  tap(index, now) {
    if ((index !== 0 && index !== 1) || this.phase(now) !== 'tapping' || now - this.lastTap[index] < CLUB.minTapMs) return false;
    this.lastTap[index] = now; this.counts[index]++; return true;
  }
  merge(index, count, done = false) {
    if ((index !== 0 && index !== 1) || !Number.isInteger(count) || count < 0 || count > Math.ceil(CLUB.tapMs / CLUB.minTapMs) || count < this.counts[index]) return false;
    this.counts[index] = count; this.finished[index] ||= done; return true;
  }
  resolve() {
    const winner = this.counts[0] === this.counts[1] ? null : this.counts[0] > this.counts[1] ? 0 : 1;
    const loser = winner === null ? null : 1 - winner;
    const transfer = loser === null ? 0 : Math.min(CLUB.stealMax, Math.ceil(this.fighters[loser].coins * CLUB.stealShare));
    return { counts: [...this.counts], winner, loser, transfer };
  }
}
