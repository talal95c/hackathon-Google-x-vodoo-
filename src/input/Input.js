// Clavier (QWERTY + AZERTY) et tactile → "intention" lue par le kernel à chaque frame :
//   { steer: -1..1 (+1 = gauche), throttle: 0/1 (courir), drift, brake, jump (front montant), shove }
// onAction(fn) : fn('confirm') sur ESPACE / ENTRÉE / tap (démarrer, réessayer).
export class Input {
  #keys = new Set();
  #touches = new Map();
  #swipe = new Map();
  #jump = false;
  #shove = false;
  #listeners = new Set();
  steer = 0;
  enabled = true; // false quand un menu a le focus

  constructor(target = window) {
    const JUMP = ['Space'];               // ↑ / W / Z servent maintenant à courir
    target.addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'INPUT') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      this.#keys.add(e.code);
      if (!e.repeat && JUMP.includes(e.code)) this.#jump = true;
      if (!e.repeat && (e.code === 'KeyE' || e.code === 'KeyF')) this.#shove = true;
      if (!e.repeat && (e.code === 'Space' || e.code === 'Enter')) this.#fire('confirm');
    });
    target.addEventListener('keyup', (e) => this.#keys.delete(e.code));
    target.addEventListener('blur', () => this.#keys.clear());
    const onTouch = (e) => {
      if (e.target.closest?.('button, input, .panel')) return;
      e.preventDefault();
      this.#touches.clear();
      for (const t of e.touches) this.#touches.set(t.identifier, t.clientX < window.innerWidth / 2 ? 1 : -1);
      for (const t of e.changedTouches) {
        if (e.type === 'touchstart') this.#swipe.set(t.identifier, t.clientY);
        else if (this.#swipe.has(t.identifier) && this.#swipe.get(t.identifier) - t.clientY > 50) { this.#jump = true; this.#swipe.delete(t.identifier); }
        if (e.type === 'touchend' || e.type === 'touchcancel') this.#swipe.delete(t.identifier);
      }
      if (e.type === 'touchstart') this.#fire('confirm');
    };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) target.addEventListener(ev, onTouch, { passive: false });
  }

  reset() {
    this.#keys.clear(); this.#touches.clear(); this.#swipe.clear();
    this.#jump = this.#shove = false; this.steer = 0;
  }

  shove() { this.#shove = true; } // bouton tactile

  onAction(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #fire(a) { if (this.enabled) this.#listeners.forEach((fn) => fn(a)); }

  // À appeler une fois par frame
  read(dt) {
    if (!this.enabled) { this.reset(); return { steer: 0, throttle: 0, drift: false, brake: false, jump: false, shove: false }; }
    const k = this.#keys;
    let target = 0;
    if (k.has('ArrowLeft') || k.has('KeyA') || k.has('KeyQ')) target += 1;
    if (k.has('ArrowRight') || k.has('KeyD')) target -= 1;
    let drift = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyC');
    if (this.#touches.size) {
      const v = [...this.#touches.values()];
      target = v[0];
      if (v.length >= 2) drift = true;
    }
    this.steer += (target - this.steer) * Math.min(1, dt * 10);
    const jump = this.#jump && this.enabled;
    const shove = this.#shove && this.enabled;
    this.#jump = false; this.#shove = false;
    // courir : ↑ / W / Z maintenu (tactile : un doigt posé)
    const throttle = k.has('ArrowUp') || k.has('KeyW') || k.has('KeyZ') || this.#touches.size > 0 ? 1 : 0;
    return { steer: this.steer, throttle, drift, brake: k.has('ArrowDown') || k.has('KeyS'), jump, shove };
  }
}
