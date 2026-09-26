import * as THREE from 'three';
import { View } from './View.js';
import { ZONES } from '../content/zones.js';
import { TRACK } from '../kernel/config.js';
import { WORLD_JUMP } from '../kernel/WorldJourney.js';

// Le portail animé dans la porte de chaque monde (la porte elle-même est bâtie par WorldDecorView) :
// un vortex aux couleurs du monde suivant, qui s'intensifie quand le dino approche et pulse au rythme.
const W = 21, H = 14; // mêmes dimensions que la porte de WorldDecorView

export class PortalView extends View {
  portals = new Map(); // index de morceau → { mesh, boundary }

  constructor(ctx) {
    super(ctx);
    this.geometry = new THREE.PlaneGeometry(W - .6, H - .6);
    this.listen('chunk:add', c => this.#build(c));
    this.listen('chunk:remove', c => this.#remove(c.index));
    for (const c of this.track.chunks) this.#build(c);
  }

  #build(chunk) {
    if (ZONES[chunk.zone]?.site) return; // monde généré : pas de portail
    for (let number = 1; number < ZONES.length; number++) {
      const boundary = number * TRACK.zoneLength;
      if (boundary < chunk.s0 || boundary >= chunk.s1) continue;
      const to = ZONES[number].palette, f = this.track.frame(boundary, {});
      const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          time: { value: 0 }, near: { value: 0 }, pulse: { value: 0 },
          edge: { value: new THREE.Color(to.edge) }, sky: { value: new THREE.Color(to.sky) }, deep: { value: new THREE.Color(to.skyTop) },
        },
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `
          uniform float time, near, pulse; uniform vec3 edge, sky, deep; varying vec2 vUv;
          void main(){
            vec2 p=(vUv-.5)*vec2(${(W / H).toFixed(3)},1.);
            float r=length(p), a=atan(p.y,p.x);
            float depth=1./(r*2.2+.12);                                   // tunnel : plus on regarde au centre, plus c'est loin
            float rings=.5+.5*sin(depth*5.-time*(3.+near*5.)+a*2.);       // anneaux en spirale qui foncent vers nous
            float rays=.5+.5*sin(a*11.+time*1.8-depth*1.5);
            vec3 col=mix(deep,sky,rings*.85);
            col=mix(col,edge,rays*.4*(.5+near));
            col+=edge*smoothstep(.5,.0,r)*(.9+pulse*.9+near*.8);          // cœur lumineux
            col+=vec3(1.)*smoothstep(.18,.0,r)*(.5+near*1.2);             // point blanc chaud au centre
            vec2 q=abs(vUv-.5)*2.;
            float alpha=(1.-smoothstep(.8,1.,max(q.x,q.y)))*(.6+.4*near);
            gl_FragColor=vec4(col*(.85+near*.5+pulse*.2),alpha);
          }`,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.position.set(f.x, f.y + WORLD_JUMP.height + 2, f.z);
      mesh.rotation.y = f.th;
      mesh.userData.noAO = true;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.portals.set(chunk.index, { mesh, boundary });
    }
  }

  #remove(index) {
    const portal = this.portals.get(index); if (!portal) return;
    portal.mesh.removeFromParent(); portal.mesh.material.dispose(); this.portals.delete(index);
  }

  update(dt, time) {
    const z = this.game.runner.z, pulse = this.ctx.fx?.pulse ?? 0;
    for (const { mesh, boundary } of this.portals.values()) {
      const distance = boundary - z;
      mesh.visible = distance > -40 && distance < 420;
      if (!mesh.visible) continue;
      const u = mesh.material.uniforms;
      u.time.value = time;
      u.pulse.value = pulse;
      u.near.value = Math.max(0, 1 - Math.abs(distance) / 160);
    }
  }

  dispose() {
    super.dispose();
    for (const index of [...this.portals.keys()]) this.#remove(index);
    this.geometry.dispose();
  }
}
