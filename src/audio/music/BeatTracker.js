// Suivi du rythme d'un flux musical, à partir des échantillons PCM (pas du son joué) :
// Lyria envoie l'audio en avance avec une heure de lecture connue, donc l'analyse est
// précise à ~10 ms quel que soit le FPS du jeu.
//
// 1. Deux enveloppes par fenêtre de 10 ms : basses (passe-bas 2 pôles, 120 Hz) et aigus (le reste).
// 2. Force d'attaque ("onset") = hausse d'énergie (log) dans chaque bande (kicks + charlestons /
//    caisse claire), moins sa moyenne glissante (ignore les nappes et la basse continue).
// 3. estimate(bpm) : filtre en peigne sur les dernières secondes → cherche la grille de
//    temps (tempo ± 3 % et phase) qui colle le mieux aux attaques.
//
// Aucune dépendance au navigateur : testable sous Node.
export class BeatTracker {
  // Réglages par défaut choisis sur de l'audio Lyria réel (techno 128 BPM) : meilleure confiance
  constructor({ hop = 0.01, window = 8, cutoff = 120, poles = 2, highWeight = 1, adaptive = 50 } = {}) {
    this.hop = hop;            // taille d'une fenêtre d'analyse (s)
    this.window = window;      // durée analysée pour l'estimation (s)
    this.cutoff = cutoff;      // coupure du passe-bas des basses (Hz)
    this.poles = poles;        // raideur du passe-bas (1 pôle = 6 dB/oct)
    this.highWeight = highWeight; // poids des attaques aiguës (charlestons, caisse claire)
    this.adaptive = adaptive;  // fenêtres de moyenne glissante soustraite (0 = off)
    this.reset();
  }

  reset() {
    this.times = [];           // heure audio de chaque fenêtre
    this.onsets = [];          // force d'attaque de chaque fenêtre
    this.lp = new Float64Array(this.poles); this.accL = 0; this.accH = 0; this.n = 0;
    this.prevL = null; this.prevH = null; this.recent = [];
  }

  // samples : Float32Array mono (ou canal gauche) ; startTime : heure audio du 1er échantillon
  analyze(samples, sampleRate, startTime) {
    const a = 1 - Math.exp((-2 * Math.PI * this.cutoff) / sampleRate);
    const hopN = Math.round(this.hop * sampleRate);
    const lp = this.lp, P = this.poles;
    for (let i = 0; i < samples.length; i++) {
      let x = samples[i];
      for (let k = 0; k < P; k++) { lp[k] += a * (x - lp[k]); x = lp[k]; }
      const hi = samples[i] - lp[0];
      this.accL += x * x;
      this.accH += hi * hi;
      if (++this.n === hopN) {
        const eL = Math.log(1e-7 + this.accL / hopN), eH = Math.log(1e-7 + this.accH / hopN);
        let onset = this.prevL === null ? 0 : Math.max(0, eL - this.prevL) + this.highWeight * Math.max(0, eH - this.prevH);
        this.prevL = eL; this.prevH = eH;
        if (this.adaptive) {
          const r = this.recent;
          r.push(onset);
          if (r.length > this.adaptive) r.shift();
          onset = Math.max(0, onset - r.reduce((u, v) => u + v, 0) / r.length);
        }
        this.times.push(startTime + (i + 1 - hopN / 2) / sampleRate);
        this.onsets.push(onset);
        this.accL = 0; this.accH = 0; this.n = 0;
      }
    }
    const keep = Math.ceil((this.window * 1.5) / this.hop);
    if (this.times.length > keep) { this.times.splice(0, this.times.length - keep); this.onsets.splice(0, this.onsets.length - keep); }
  }

  // → { bpm, beatTime (heure audio d'un temps), confidence } ou null si pas assez de données
  estimate(bpm, { until = Infinity, tempoRange = 0.03 } = {}) {
    const T = this.times, O = this.onsets;
    let end = T.length;
    while (end > 0 && T[end - 1] > until) end--;
    const start = Math.max(0, end - Math.round(this.window / this.hop));
    if (end - start < Math.round(3 / this.hop)) return null;
    const t0 = T[start];
    let mean = 0;
    for (let i = start; i < end; i++) mean += O[i];
    mean /= end - start;
    if (mean <= 0) return null;

    let best = { score: -1 };
    for (let dt = -tempoRange; dt <= tempoRange + 1e-9; dt += 0.005) {
      const period = 60 / (bpm * (1 + dt));
      const bins = Math.max(8, Math.round(period / this.hop));
      const hist = new Float64Array(bins);
      for (let i = start; i < end; i++) {
        const ph = ((T[i] - t0) / period) % 1;
        hist[Math.floor(ph * bins) % bins] += O[i];
      }
      // lissage sur 3 cases (tolère ±1 fenêtre de jitter)
      for (let b = 0; b < bins; b++) {
        const s = hist[(b + bins - 1) % bins] * 0.5 + hist[b] + hist[(b + 1) % bins] * 0.5;
        if (s > best.score) best = { score: s, period, phase: (b + 0.5) / bins, bpm: bpm * (1 + dt) };
      }
    }
    const beats = (end - start) * this.hop / best.period;
    return {
      bpm: best.bpm,
      beatTime: t0 + best.phase * best.period,
      confidence: best.score / (mean * beats * 2), // ≈ 1 si aléatoire, bien plus haut si rythmé
    };
  }
}
