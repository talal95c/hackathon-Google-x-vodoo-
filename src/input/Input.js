import { ThumbGestures } from './ThumbInput.js';

// Clavier (QWERTY + AZERTY) et tactile → "intention" lue par le kernel à chaque frame :
//   { steer: -1..1 (+1 = gauche), drift, brake, jump, attack, item, shove: -1|0|1 } (jump/attack/item/shove = front montant)
// Tactile : scheme 'thumb' (pouce qui glisse, voir ThumbInput.js) ou 'halves' (moitiés d'écran, tap bref = parade ; en mode pouce, le tap sert aussi à parer).
// onAction(fn) : fn('confirm') sur ESPACE / ENTRÉE / tap (démarrer, réessayer), fn('emote', i) sur 1-4.
export class Input {
  #keys = new Set();
  #touches = new Map();
  #swipe = new Map();
  #jump = false; #attack = false; #item = false; #shove = 0;
  #listeners = new Set();
  steer = 0;
  enabled = true; // false quand un menu a le focus
  thumb = new ThumbGestures();

  constructor(target = window, { scheme } = {}) {
    this.scheme = scheme ?? (globalThis.localStorage?.getItem('dino-escape-touch') || 'thumb');
    const JUMP = ['Space', 'ArrowUp', 'KeyW', 'KeyZ'];
    target.addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'INPUT') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      this.#keys.add(e.code);
      if (e.repeat) return;
      if (JUMP.includes(e.code)) this.#jump = true;
      if (e.code === 'KeyF') this.#attack = true;
      if (e.code === 'KeyE') this.#item = true;
      if (e.code === 'KeyX') this.#shove = this.steer > 0.15 ? 1 : this.steer < -0.15 ? -1 : (this.lastSide ?? 1);
      if (/^Digit[1-4]$/.test(e.code)) this.#fire('emote', +e.code.slice(5) - 1);
      if (e.code === 'Space' || e.code === 'Enter') this.#fire('confirm');
    });
    target.addEventListener('keyup', (e) => this.#keys.delete(e.code));
    target.addEventListener('blur', () => this.#keys.clear());
    const onTouch = (e) => {
      if (e.target.closest?.('button, input, .panel, .no-steer')) return;
      e.preventDefault();
      if (this.scheme === 'thumb') {
        const t = e.timeStamp || performance.now();
        for (const c of e.changedTouches) {
          if (e.type === 'touchstart') this.thumb.down(c.identifier, c.clientX, c.clientY, t);
          else if (e.type === 'touchmove') this.thumb.move(c.identifier, c.clientX, c.clientY, t);
          else this.thumb.up(c.identifier, c.clientX, c.clientY, t);
        }
      } else {
        this.#touches.clear();
        for (const t of e.touches) this.#touches.set(t.identifier, t.clientX < window.innerWidth / 2 ? 1 : -1);
        for (const t of e.changedTouches) {
          if (e.type === 'touchstart') this.#swipe.set(t.identifier, { y: t.clientY, x: t.clientX, at: performance.now() });
          else if (this.#swipe.has(t.identifier)) {
            const start = this.#swipe.get(t.identifier);
            if (e.type !== 'touchcancel' && start.y - t.clientY > 50) { this.#jump = true; this.#swipe.delete(t.identifier); }
            else if (e.type === 'touchend' && performance.now() - start.at < 300
              && Math.hypot(t.clientX - start.x, t.clientY - start.y) < 25 && e.touches.length === 0) this.#attack = true;
          }
          if (e.type === 'touchend' || e.type === 'touchcancel') this.#swipe.delete(t.identifier);
        }
      }
      if (e.type === 'touchstart') this.#fire('confirm');
    };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) target.addEventListener(ev, onTouch, { passive: false });
  }

  setScheme(s) { this.scheme = s; globalThis.localStorage?.setItem('dino-escape-touch', s); }

  onAction(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #fire(a, arg) { if (this.enabled) this.#listeners.forEach((fn) => fn(a, arg)); }

  // Bouton d'objet à l'écran
  pressItem() { this.#item = true; }

  // À appeler une fois par frame
  read(dt) {
    const k = this.#keys;
    let target = 0;
    if (k.has('ArrowLeft') || k.has('KeyA') || k.has('KeyQ')) target += 1;
    if (k.has('ArrowRight') || k.has('KeyD')) target -= 1;
    let drift = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyC');
    const g = this.thumb.take();
    if (this.thumb.active) {
      target = this.thumb.steer;
      drift ||= this.thumb.drift;
    } else if (this.#touches.size) {
      const v = [...this.#touches.values()];
      target = v[0];
      if (v.length >= 2) drift = true;
    }
    this.steer += (target - this.steer) * Math.min(1, dt * (this.thumb.active ? 18 : 10));
    if (Math.abs(this.steer) > 0.15) this.lastSide = Math.sign(this.steer);
    const on = this.enabled;
    const out = {
      steer: this.steer, drift, brake: k.has('ArrowDown') || k.has('KeyS'),
      jump: on && (this.#jump || g.jump), attack: on && (this.#attack || g.item), item: on && (this.#item || g.item), shove: on ? (this.#shove || g.shove) : 0,
    };
    this.#jump = false; this.#attack = false; this.#item = false; this.#shove = 0;
    return out;
  }
}
