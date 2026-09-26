import * as THREE from 'three';
import { View } from './View.js';

// Effets calés sur la musique (événement 'beat' du kernel).
//   pulse : 1 sur chaque temps puis décroît ; down : pareil mais sur le 1er temps de la mesure.
// Les autres vues lisent ctx.fx.pulse / ctx.fx.down (caméra…).
// Les matériaux ajoutés à ctx.beatMaterials flashent vers le blanc sur les temps.
const WHITE = new THREE.Color(0xffffff);

export class BeatFx extends View {
  pulse = 0;
  down = 0;

  constructor(ctx) {
    super(ctx);
    ctx.fx = this;
    ctx.beatMaterials ??= new Set();
    this.listen('beat', ({ downbeat }) => {
      if (this.game.state !== 'playing') return;
      this.pulse = 1;
      if (downbeat) this.down = 1;
    });
  }

  update(dt) {
    this.pulse *= Math.exp(-dt * 9);
    this.down *= Math.exp(-dt * 6);
    for (const m of this.ctx.beatMaterials) {
      m.userData.base ??= m.color.clone();
      m.color.copy(m.userData.base).lerp(WHITE, this.pulse * 0.55);
    }
  }
}
