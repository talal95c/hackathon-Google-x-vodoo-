// Clavier (QWERTY + AZERTY) et tactile → "intention" lue par le kernel à chaque frame :
//   { steer: -1..1 (+1 = gauche), throttle: 0/1 (courir), drift, slideStraight, brake, jump (front montant), shove }
// onAction(fn) : fn('confirm') sur ESPACE / ENTRÉE / tap (démarrer, réessayer).
//
// Tactile : un doigt posé = courir ; glisser à gauche / droite = direction analogique (ancre flottante :
// revenir en arrière change de sens tout de suite) ; balayage vers le haut = saut ; vers le bas = glissade
// (tenue tant que le doigt reste posé) ; deuxième doigt = glissade aussi.
const SWIPE_PX = 34;     // distance minimale d'un balayage vertical
const SWIPE_MS = 220;    // … parcourue en moins de ce temps
const DEADZONE_PX = 5;
const REVERSE_PX = 8;   // recul du pouce qui inverse la direction

export class Input {
  #keys = new Set();
  #touches = new Map(); // id → { x, y } (seulement les doigts posés hors UI)
  #lead = null;         // doigt qui dirige : { id, ax, samples: [{ x, y, t }], slide }
  #jump = false;
  #shove = false;
  #listeners = new Set();
  steer = 0;
  enabled = true; // false quand un menu a le focus

  constructor(target = window, { now = () => performance.now(), width = () => globalThis.innerWidth || 400 } = {}) {
    this.now = now;
    this.width = width;
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
    target.addEventListener('blur', () => { this.#keys.clear(); this.#touches.clear(); this.#lead = null; });
    const onTouch = (e) => {
      const t = this.now();
      let tracked = false;
      for (const c of e.changedTouches) {
        if (e.type === 'touchstart') {
          if (c.target?.closest?.('button, input, label, a, .panel')) continue;
          this.#touches.set(c.identifier, { x: c.clientX, y: c.clientY });
          if (!this.#lead) this.#lead = { id: c.identifier, ax: c.clientX, samples: [{ x: c.clientX, y: c.clientY, t }], slide: false, dir: 0, ex: c.clientX };
          tracked = true;
        } else if (this.#touches.has(c.identifier)) {
          tracked = true;
          if (e.type === 'touchmove') { this.#touches.set(c.identifier, { x: c.clientX, y: c.clientY }); if (this.#lead?.id === c.identifier) this.#move(c.clientX, c.clientY, t); }
          else this.#release(c.identifier, t);
        }
      }
      if (!tracked) return;
      if (e.cancelable) e.preventDefault();
      if (e.type === 'touchstart') this.#fire('confirm');
    };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) target.addEventListener(ev, onTouch, { passive: false });
  }

  get #range() { return Math.max(40, Math.min(90, this.width() * 0.13)); } // px de glissé pour braquer à fond

  #move(x, y, t) {
    const l = this.#lead, r = this.#range;
    // Ancre flottante : on ne s'éloigne jamais de plus de `r`, pour que revenir en arrière braque aussitôt
    if (x - l.ax > r) l.ax = x - r; else if (l.ax - x > r) l.ax = x + r;
    // Demi-tour du pouce : l'ancre se replace au point de retournement → on braque de l'autre côté
    const dir = Math.sign(l.ax - x) || l.dir;
    if (dir !== l.dir) { l.dir = dir; l.ex = x; }
    else if (dir > 0) { if (x - l.ex > REVERSE_PX) { l.ax = l.ex; l.dir = -1; l.ex = x; } else l.ex = Math.min(l.ex, x); }
    else if (dir < 0) { if (l.ex - x > REVERSE_PX) { l.ax = l.ex; l.dir = 1; l.ex = x; } else l.ex = Math.max(l.ex, x); }
    l.samples.push({ x, y, t });
    while (l.samples.length > 1 && t - l.samples[0].t > SWIPE_MS) l.samples.shift();
    const o = l.samples[0], dy = y - o.y, dx = x - o.x;
    if (Math.abs(dy) < SWIPE_PX || Math.abs(dy) < Math.abs(dx) * 1.1) return;
    if (dy < 0) { this.#jump = true; l.slide = false; }
    else l.slide = true;
    l.samples = [{ x, y, t }]; // un balayage = une action
  }

  #release(id, t) {
    this.#touches.delete(id);
    if (this.#lead?.id !== id) return;
    const [next] = this.#touches;
    this.#lead = next ? { id: next[0], ax: next[1].x, samples: [{ x: next[1].x, y: next[1].y, t }], slide: false, dir: 0, ex: next[1].x } : null;
  }

  reset() {
    this.#keys.clear(); this.#touches.clear(); this.#lead = null;
    this.#jump = this.#shove = false; this.steer = 0;
  }

  shove() { this.#shove = true; } // bouton tactile

  onAction(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #fire(a) { if (this.enabled) this.#listeners.forEach((fn) => fn(a)); }

  #touchSteer() {
    const l = this.#lead;
    const p = l && this.#touches.get(l.id);
    if (!p) return 0;
    const d = l.ax - p.x;
    if (Math.abs(d) < DEADZONE_PX) return 0;
    return Math.max(-1, Math.min(1, (d - Math.sign(d) * DEADZONE_PX) / (this.#range - DEADZONE_PX)));
  }

  // À appeler une fois par frame
  read(dt) {
    if (!this.enabled) { this.reset(); return { steer: 0, throttle: 0, drift: false, brake: false, jump: false, shove: false }; }
    const k = this.#keys;
    let target = 0;
    if (k.has('ArrowLeft') || k.has('KeyA') || k.has('KeyQ')) target += 1;
    if (k.has('ArrowRight') || k.has('KeyD')) target -= 1;
    let drift = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyC');
    let slideStraight = false;
    const touching = this.#touches.size > 0;
    if (touching) {
      target = this.#touchSteer();
      if (this.#touches.size >= 2 || this.#lead?.slide) drift = true;
      slideStraight = !!this.#lead?.slide; // balayage ↓ : glissade possible sans braquer
    }
    // Le doigt est déjà analogique : lissage léger pour rester collé au pouce
    this.steer += (target - this.steer) * Math.min(1, dt * (touching ? 24 : 10));
    const jump = this.#jump;
    const shove = this.#shove;
    this.#jump = false; this.#shove = false;
    // courir : ↑ / W / Z maintenu (tactile : un doigt posé)
    const throttle = k.has('ArrowUp') || k.has('KeyW') || k.has('KeyZ') || touching ? 1 : 0;
    return { steer: this.steer, throttle, drift, slideStraight, brake: k.has('ArrowDown') || k.has('KeyS'), jump, shove };
  }
}
