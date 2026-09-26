// Contrôle au pouce (tactile), sans DOM : testable sous Node.
// Le pouce posé crée un point d'ancrage invisible ; on glisse sans lever le doigt.
//   gauche/droite  → direction analogique (l'ancre suit le pouce au-delà de `span` px)
//   coup vers le haut → saut (en l'air : figure)
//   glisser vers le bas et tenir → glissade (drift)
//   coup rapide sur le côté → coup d'épaule
//   tap d'un 2e doigt (ou tap bref seul) → utiliser l'objet
export const THUMB = { span: 60, flickUp: 42, flickSide: 48, flickMs: 140, driftDown: 42, driftRelease: 24, tapMs: 180, tapMove: 12 };

export class ThumbGestures {
  steer = 0; drift = false;
  #main = null;       // { id, ax, ay, sx, sy, t0, hist: [{x, y, t}] }
  #jump = false; #item = false; #shove = 0;

  down(id, x, y, t) {
    if (this.#main) { this.#item = true; return; } // 2e doigt = objet
    this.#main = { id, ax: x, ay: y, sx: x, sy: y, t0: t, moved: 0, hist: [{ x, y, t }], lastFlick: -1e9 };
  }

  move(id, x, y, t) {
    const m = this.#main;
    if (!m || m.id !== id) return;
    m.moved = Math.max(m.moved, Math.hypot(x - m.sx, y - m.sy));
    m.hist.push({ x, y, t });
    while (m.hist.length > 1 && t - m.hist[0].t > THUMB.flickMs) m.hist.shift(); // geste lent ≠ coup rapide
    // ancre horizontale flottante
    if (x - m.ax > THUMB.span) m.ax = x - THUMB.span;
    if (m.ax - x > THUMB.span) m.ax = x + THUMB.span;
    this.steer = Math.max(-1, Math.min(1, (m.ax - x) / THUMB.span)); // + = gauche
    // gestes rapides sur la fenêtre récente
    const o = m.hist[0], dx = x - o.x, dy = y - o.y;
    if (t - m.lastFlick > 200) {
      if (-dy > THUMB.flickUp && -dy > Math.abs(dx) * 1.2) { this.#jump = true; m.lastFlick = t; m.ay = y; m.hist = [{ x, y, t }]; }
      else if (Math.abs(dx) > THUMB.flickSide && Math.abs(dx) > Math.abs(dy) * 1.5) { this.#shove = dx < 0 ? 1 : -1; m.lastFlick = t; m.hist = [{ x, y, t }]; }
    }
    if (y - m.ay > THUMB.driftDown) this.drift = true;
    else if (y - m.ay < THUMB.driftRelease) this.drift = false;
    if (m.ay > y) m.ay = y; // l'ancre verticale remonte avec le pouce
  }

  up(id, x, y, t) {
    const m = this.#main;
    if (!m || m.id !== id) return;
    this.move(id, x, y, t); // coup rapide sans touchmove intermédiaire
    if (t - m.t0 < THUMB.tapMs && m.moved < THUMB.tapMove) this.#item = true; // tap bref
    this.#main = null;
    this.steer = 0; this.drift = false;
  }

  get active() { return !!this.#main; }

  // Actions ponctuelles (front montant), remises à zéro à la lecture
  take() {
    const out = { jump: this.#jump, item: this.#item, shove: this.#shove };
    this.#jump = false; this.#item = false; this.#shove = 0;
    return out;
  }
}
