// A single deadline prevents queued beeps or duplicate starts after tab throttling.
export class RaceCountdown {
  step = null;
  timer = null;

  constructor({ onStep, now = () => performance.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id) }) {
    Object.assign(this, { onStep, now, setTimer, clearTimer });
  }

  get running() { return this.step !== null && this.step !== 0; }

  start(delay, go) {
    this.cancel();
    this.deadline = this.now() + Math.max(0, delay);
    this.go = go;
    this.tick();
  }

  tick() {
    const left = this.deadline - this.now();
    const step = left > 3000 ? 'ready' : Math.max(0, Math.ceil(left / 1000));
    if (this.step !== step) { this.step = step; this.onStep(step); }
    if (step === 0) {
      const go = this.go;
      this.go = null;
      this.timer = this.setTimer(() => this.cancel(), 850);
      go?.();
    } else {
      const wait = step === 'ready' ? left - 3000 : left - (step - 1) * 1000;
      this.timer = this.setTimer(() => this.tick(), Math.max(1, wait));
    }
  }

  cancel() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null; this.go = null;
    if (this.step !== null) { this.step = null; this.onStep(null); }
  }
}
