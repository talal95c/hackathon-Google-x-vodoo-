import * as THREE from 'three';
import { View } from './View.js';

// Effets de vitesse plein écran, lus par main.js → World.render → PostProcessing.
//   lines : lignes de vitesse, toujours présentes en jeu et de plus en plus denses avec la vitesse
//           (0 à 30 m/s, 1 à 62 m/s : palier 5 + sprint), tempête pendant le saut entre deux mondes
//   blur  : flou radial (sprint, saut entre deux mondes)
//   rush  : aberration chromatique
//   flash : l'écran se noie dans flashColor un court instant (passage du portail, atterrissage)
const WHITE = new THREE.Color(0xffffff);
const clamp = v => Math.max(0, Math.min(1, v));

export class TransitionFx extends View {
  lines = 0; blur = 0; rush = 0; flash = 0;
  flashColor = new THREE.Color(0xffffff);
  #burst = 0;

  constructor(ctx) {
    super(ctx);
    ctx.transition = this;
    this.listen('game:start', () => { this.lines = this.blur = this.rush = this.flash = this.#burst = 0; });
    this.listen('world:jump', ({ to }) => { this.#burst = 1; this.#flash(.3, to.palette.edge, .3); });
    // Le changement de zone tombe pile au passage du portail : l'écran se noie dans le ciel du monde suivant.
    this.listen('zone', ({ zone }) => { if (this.game.worldJump) this.#flash(1, zone.palette.sky, .55); });
    this.listen('world:land', ({ zone }) => this.#flash(.4, zone.palette.edge, .5));
    this.listen('runner:boost', ({ big }) => { this.#burst = Math.max(this.#burst, big ? .8 : .45); });
  }

  #flash(amount, hex, white) {
    if (amount < this.flash) return;
    this.flash = amount;
    this.flashColor.setHex(hex).lerp(WHITE, white);
  }

  update(dt) {
    const g = this.game, r = g.runner, playing = g.state === 'playing';
    let lines = playing ? clamp((Math.max(0, r.speed) - 30) / 32) : 0;
    let blur = 0, rush = 0;
    if (playing && r.boost > 0) { lines = Math.max(lines, .55); blur = .3; rush = .8; }
    if (g.worldJump) {
      const p = Math.sin(g.worldJump.progress * Math.PI);
      lines = Math.max(lines, .5 + .5 * p); blur = Math.max(blur, .85 * p); rush = Math.max(rush, p);
    }
    this.#burst *= Math.exp(-dt * 2.5);
    lines = Math.min(1, lines + this.#burst * .5);
    this.lines += (lines - this.lines) * Math.min(1, dt * 5);
    this.blur += (blur - this.blur) * Math.min(1, dt * 6);
    this.rush += (rush - this.rush) * Math.min(1, dt * 6);
    this.flash *= Math.exp(-dt * 7);
    if (this.flash < .002) this.flash = 0;
  }
}
