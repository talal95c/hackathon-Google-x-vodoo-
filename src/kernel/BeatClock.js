// Horloge musicale du jeu (pure, sans audio) : compte les temps au tempo courant.
// La musique la recale (nudge) : tempo imposé à Lyria + détection des kicks.
//
// Événement : 'beat' { index, bar, downbeat } à chaque temps.
export class BeatClock {
  bpm = 120;
  beats = 0;          // temps écoulés (réel) : partie entière = n° du temps, fraction = phase
  #last = -1;

  constructor(bus) { this.bus = bus; }

  get period() { return 60 / this.bpm; }
  get phase() { return this.beats - Math.floor(this.beats); }

  setBpm(bpm) { if (bpm > 30 && bpm < 300) this.bpm = bpm; }

  update(dt) {
    this.beats += dt / this.period;
    const i = Math.floor(this.beats);
    if (i !== this.#last) {
      this.#last = i;
      this.bus?.emit('beat', { index: i, bar: Math.floor(i / 4), downbeat: i % 4 === 0 });
    }
  }

  // Décale la phase (en temps) : +0.1 = l'horloge avance d'un dixième de temps
  nudge(deltaBeats) { this.beats += deltaBeats; }

  // Nombre de temps (fractionnaire) dans `seconds` secondes
  beatsIn(seconds) { return seconds / this.period; }

  // Délai (s) pour atteindre la subdivision la plus proche de `seconds` dans le futur.
  // sub = 1 : sur les temps ; sub = 2 : sur les croches…
  snapDelay(seconds, sub = 1) {
    const target = Math.round((this.beats + this.beatsIn(seconds)) * sub) / sub;
    return (target - this.beats) * this.period;
  }
}
