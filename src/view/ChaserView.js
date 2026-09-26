import * as THREE from 'three';
import { View } from './View.js';

// Le curseur géant. Apparaît au-dessus du dino quand il se rapproche.
export class ChaserView extends View {
  #f = {};

  constructor(ctx) {
    super(ctx);
    this.focus = ctx.focus;
    const s = new THREE.Shape();
    [[0, 0], [0, -17], [4, -13], [7, -20], [10, -19], [7, -12], [12, -12]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false }).translate(0, 0, -1);
    const black = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x111111 }));
    const white = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    white.scale.set(1.12, 1.08, 0.9); white.position.set(-0.7, 0.8, 0);
    black.castShadow = true;
    const g = new THREE.Group(); g.add(white, black);
    g.scale.setScalar(0.42); g.rotation.x = -0.5;
    this.object = new THREE.Group(); this.object.add(g);
    this.scene.add(this.object);
  }

  update(dt, time) {
    const game = this.game, P = this.focus, o = this.object;
    if (game.state === 'menu') {
      o.position.set(P.x + 5, P.y + 7 + Math.sin(time * 2) * 0.6, P.z - 4);
      o.rotation.set(0, time * 0.5, 0);
      return;
    }
    const gap = game.chaser.gap(game.sMax);
    const f = this.track.frame(Math.max(0, game.chaser.s + 18), this.#f);
    o.position.set(f.x, f.y + 3 + gap * 0.25 + Math.sin(time * 3) * 0.4, f.z);
    o.rotation.set(0, f.th + Math.PI, 0);
    o.scale.setScalar(1 + (this.ctx.fx?.pulse ?? 0) * 0.12);
  }
}
