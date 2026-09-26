// Ambiance du match (0 → 1, lissée) calculée à partir de ce qui se passe, pour la musique :
//   fight   : bagarre en cours (rivaux proches, coups donnés / reçus, bousculades)
//   danger  : il ne reste qu'une vie
//   triumph : on vient d'éliminer quelqu'un (quelques secondes)
// Aucune dépendance audio : testable. race() → source des rivaux (multijoueur ou PNJ) ou null.
export class MatchMood {
  fight = 0; danger = 0; triumph = 0;
  #fightKick = 0; #triumphKick = 0;

  constructor(game, race = () => null) {
    this.game = game;
    this.race = race;
    const kick = (v) => () => { this.#fightKick = Math.min(1, this.#fightKick + v); };
    game.on('club:hit', kick(.2));
    game.on('club:result', () => { this.#triumphKick = 1; });
    game.on('mp:shove', ({ hit }) => kick(hit ? 0.5 : 0.2)());
    game.on('runner:knocked', kick(0.45));
    game.on('mp:bump', kick(0.2));
    game.on('bot:out', () => { this.#triumphKick = 1; });
    game.on('mp:out', () => { this.#triumphKick = 1; });
    game.on('game:start', () => { this.fight = this.danger = this.triumph = this.#fightKick = this.#triumphKick = 0; });
  }

  update(dt) {
    const g = this.game, r = g.runner;
    if (g.state !== 'playing' && g.state !== 'falling' && g.state !== 'duel') return this;
    // rival le plus proche (encore en course)
    let nearest = Infinity;
    for (const p of this.race()?.rivals() ?? []) {
      const v = p.view;
      if (!v || v.st !== 'playing') continue;
      nearest = Math.min(nearest, Math.hypot(v.s - r.z, v.d - r.x));
    }
    const proximity = nearest < 14 ? 1 - nearest / 14 : 0;
    this.#fightKick *= Math.exp(-dt / 3);        // un coup "chauffe" la musique ~3 s
    this.#triumphKick *= Math.exp(-dt / 5);
    const fight = Math.min(1, proximity * 0.6 + this.#fightKick);
    const danger = g.lives <= 1 && g.state === 'playing' ? 1 : 0;
    // lissage (montée plus rapide que la descente) : pas de changements brusques
    const ease = (cur, target, up, down) => cur + (target - cur) * Math.min(1, dt * (target > cur ? up : down));
    this.fight = ease(this.fight, fight, 2, 0.4);
    this.danger = ease(this.danger, danger, 1, 0.5);
    this.triumph = ease(this.triumph, this.#triumphKick, 3, 0.8);
    return this;
  }
}
