import { TRACK } from './config.js';
import { worldIndex } from './WorldJourney.js';

// Route procédurale continue (virages + dénivelé), en données pures.
//
// Coordonnées "piste" : s = distance le long de la route, d = décalage latéral (+ = gauche).
// frame(s) donne le repère monde de la route en s. La route est découpée en morceaux
// (chunks) de 120 m : les vues construisent un maillage par morceau, le Director
// y fait apparaître des entités (track.populate est branché par Game).
//
// Événements : 'chunk:add' (chunk), 'chunk:remove' (chunk)
export class Track {
  constructor(bus, rng) {
    this.bus = bus;
    this.rng = rng;
    this.chunks = [];
    this.populate = null; // (chunk) => void, fourni par Game
  }

  reset() {
    for (const c of this.chunks) this.bus.emit('chunk:remove', c);
    this.chunks = [];
    this.nextChunk = 0;
    // Échantillons (tableaux parallèles, lecture seule pour les vues)
    this.X = [0]; this.Y = [0]; this.Z = [0]; this.TH = [0]; this.K = [0]; this.SL = [0]; this.W = [TRACK.width];
    // sel du décor : change à chaque partie (dérivé de la graine de route → reproductible)
    this.salt = Math.floor(this.rng.next() * 1e6);
    this.gen = { th: 0, k: 0, kT: 0, kLeft: 60, inArc: false, slope: 0, slT: 0, slLeft: 80, lastHard: -Infinity };
    this.hardTurns = [];   // virages durs : { s, end, sign (+1 = à gauche) }, lus par le Director et les vues
  }

  get chunkLength() { return TRACK.step * TRACK.chunkSamples; }

  static zoneIndex(s) { return worldIndex(s); }
  static zoneNumber(s) { return Math.floor(Math.max(0, s) / TRACK.zoneLength); }

  // --- Échantillons
  ensure(s) {
    const need = Math.ceil(s / TRACK.step) + 2;
    const g = this.gen, r = this.rng;
    while (this.X.length < need) {
      const i = this.X.length;
      const dist = i * TRACK.step;
      const warm = dist < TRACK.startStraight;
      const diff = Math.min(1, dist / 4000);

      // Courbure : arcs planifiés (angle + rayon) séparés de lignes droites
      g.kLeft -= TRACK.step;
      if (g.kLeft <= 0) {
        const hard = !g.inArc && dist > TRACK.hardTurnFrom && dist - g.lastHard > TRACK.hardTurnSpacing
          && r.chance(TRACK.hardTurnChance + diff * 0.1);
        if (hard) {
          // virage dur : on tourne du côté où il y a le plus de marge de cap
          const sign = g.th <= 0 ? 1 : -1;
          const angle = Math.min(TRACK.maxHeading - sign * g.th, r.range(...TRACK.hardTurnAngle));
          const R = r.range(...TRACK.hardTurnRadius);
          g.inArc = true; g.kT = sign / R; g.kLeft = angle * R; g.lastHard = dist;
          this.hardTurns.push({ s: dist, end: dist + angle * R + 12, sign });
        } else if (g.inArc || r.chance(0.35)) {
          g.inArc = false; g.kT = 0; g.kLeft = r.range(0, 40) * (1 - diff * 0.5);
        } else {
          const rMin = TRACK.radiusEasy + (TRACK.radiusHard - TRACK.radiusEasy) * diff;
          const R = r.chance(0.3) ? rMin : r.range(rMin, TRACK.radiusMax);
          let sign = r.sign();
          if (Math.abs(g.th) > 0.5) sign = -Math.sign(g.th);
          const room = TRACK.maxHeading - sign * g.th;
          const angle = Math.min(room, r.range(0.4, 1.6));
          g.inArc = true; g.kT = sign / R; g.kLeft = Math.max(8, angle * R);
        }
      }
      g.k += ((warm ? 0 : g.kT) - g.k) * 0.25;
      if (Math.abs(g.th) > TRACK.maxHeading + 0.05 && Math.sign(g.k) === Math.sign(g.th)) g.k = 0;

      // Pente : collines, bosses, descentes
      g.slLeft -= TRACK.step;
      if (g.slLeft <= 0) {
        const sMax = TRACK.slopeEasy + (TRACK.slopeHard - TRACK.slopeEasy) * diff;
        g.slT = r.chance(0.25) ? 0 : r.range(-1, 1) * sMax;
        const y = this.Y[i - 1];
        if (y > TRACK.heightLimit) g.slT = -Math.abs(g.slT);
        else if (y < -TRACK.heightLimit) g.slT = Math.abs(g.slT);
        g.slLeft = r.range(30, 100);
      }
      g.slope += ((warm ? 0 : g.slT) - g.slope) * 0.05;

      g.th += g.k * TRACK.step;
      this.TH.push(g.th); this.K.push(g.k); this.SL.push(g.slope);
      this.X.push(this.X[i - 1] + Math.sin(g.th) * TRACK.step);
      this.Z.push(this.Z[i - 1] + Math.cos(g.th) * TRACK.step);
      this.Y.push(this.Y[i - 1] + g.slope * TRACK.step);
      this.W.push(Math.max(TRACK.widthMin, TRACK.width - dist / 900) + Math.min(4, Math.abs(g.k) * TRACK.curveWidening));
    }
  }

  // Repère interpolé en s : position, cap th, courbure k, pente, largeur w, vecteur gauche (lx, lz)
  frame(s, out = {}) {
    this.ensure(s + TRACK.step);
    const f = Math.max(0, s) / TRACK.step;
    const i = Math.floor(f), t = f - i;
    const L = (A) => A[i] + (A[i + 1] - A[i]) * t;
    out.x = L(this.X); out.y = L(this.Y); out.z = L(this.Z);
    out.th = L(this.TH); out.k = L(this.K); out.slope = L(this.SL); out.w = L(this.W);
    out.lx = Math.cos(out.th); out.lz = -Math.sin(out.th);
    return out;
  }

  // Point monde pour (s, d, hauteur au-dessus de la route)
  point(s, d = 0, h = 0, out = {}) {
    const f = this.frame(s, this._pf || (this._pf = {}));
    out.x = f.x + f.lx * d; out.y = f.y + h; out.z = f.z + f.lz * d;
    return out;
  }

  // Virage dur qui englobe s (avec une marge avant), sinon null
  hardTurnAt(s, before = 0) {
    for (const t of this.hardTurns) if (s >= t.s - before && s <= t.end) return t;
    return null;
  }

  // Distance mini entre un point monde et l'axe de la route autour de s
  clearance(x, z, s, window = 260) {
    let best = Infinity;
    const i0 = Math.max(0, Math.floor((s - window) / TRACK.step));
    const i1 = Math.min(this.X.length - 1, Math.floor((s + window) / TRACK.step));
    for (let i = i0; i <= i1; i += 3) best = Math.min(best, Math.hypot(this.X[i] - x, this.Z[i] - z));
    return best;
  }

  // --- Morceaux et entités
  update(s) {
    while (this.nextChunk * this.chunkLength < s + TRACK.aheadDistance) this.#buildChunk();
    while (this.chunks.length && this.chunks[0].s1 < s - TRACK.behindDistance) this.bus.emit('chunk:remove', this.chunks.shift());
  }

  #buildChunk() {
    const index = this.nextChunk++;
    const i0 = index * TRACK.chunkSamples, i1 = i0 + TRACK.chunkSamples;
    const s0 = i0 * TRACK.step, s1 = i1 * TRACK.step;
    this.ensure(s1 + TRACK.step);
    const zone = Track.zoneIndex(s0);
    const chunk = { index, i0, i1, s0, s1, zone };
    this.chunks.push(chunk);
    this.bus.emit('chunk:add', chunk);
    this.populate?.(chunk);
  }
}
