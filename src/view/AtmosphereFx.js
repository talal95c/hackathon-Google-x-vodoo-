import * as THREE from 'three';
import { View } from './View.js';

// Particules d'ambiance + traînées de vitesse, 100 % GPU : un champ infini de points qui se
// "replie" autour de la caméra (modulo dans le shader) → aucune mise à jour côté CPU.
// Un style par monde (index de zone) : sable, pixels, étincelles, bits de données, orbes.
const STYLES = [
  { color: 0xffe2ad, size: 1.4, drift: [3.5, 0.3, 0.6], shape: 0, twinkle: 0.2, alpha: 0.75 },  // désert : sable au vent
  { color: 0x8fd0ff, size: 1.1, drift: [0.4, 0.6, 0], shape: 1, twinkle: 0.6, alpha: 0.6 },      // navigateur : pixels flottants
  { color: 0x9fdcff, size: 0.8, drift: [0, 0.8, 0], shape: 2, twinkle: 1, alpha: 0.8 },           // Windows : étincelles
  { color: 0x46ffc2, size: 1.0, drift: [0, 3.2, 0], shape: 1, twinkle: 0.8, alpha: 0.85 },        // hardware : bits qui montent
  { color: 0xffffff, size: 1.8, drift: [0.6, 0.25, 0], shape: 0, twinkle: 0.4, alpha: 0.5 },      // cloud : orbes lumineux
];
const BOX = new THREE.Vector3(140, 46, 140);

export class AtmosphereFx extends View {
  #color = new THREE.Color(STYLES[0].color);
  #drift = new THREE.Vector3(...STYLES[0].drift);
  #fwd = new THREE.Vector3(0, 0, 1);
  #f = {};

  constructor(ctx) {
    super(ctx);
    const mobile = window.matchMedia?.('(pointer: coarse)').matches;
    this.#buildMotes(mobile ? 700 : 1800);
    this.#buildStreaks(mobile ? 70 : 160);
  }

  #buildMotes(n) {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * BOX.x; pos[i * 3 + 1] = Math.random() * BOX.y; pos[i * 3 + 2] = Math.random() * BOX.z;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.motes = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        cam: { value: new THREE.Vector3() }, box: { value: BOX }, time: { value: 0 }, drift: { value: this.#drift },
        color: { value: this.#color }, size: { value: 1 }, shape: { value: 0 }, twinkle: { value: 0.3 }, alpha: { value: 0.6 },
        pixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: `
        attribute float seed; uniform vec3 cam, box, drift; uniform float time, size, pixelRatio, twinkle; varying float vA;
        void main(){
          vec3 p = position + drift * time * (0.6 + seed) + vec3(sin(time * .7 + seed * 40.) * 1.5, sin(time * 1.1 + seed * 17.) * .8, 0.);
          p = mod(p - cam + box * .5, box) - box * .5 + cam;   // champ infini autour de la caméra
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          float dist = -mv.z;
          vA = (1. - twinkle * .5 + twinkle * .5 * sin(time * 3. + seed * 60.)) * smoothstep(0., 8., dist) * (1. - smoothstep(45., 70., dist));
          gl_PointSize = size * (0.6 + seed) * 22. * pixelRatio / max(dist, 1.);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 color; uniform float shape, alpha; varying float vA;
        void main(){
          vec2 q = gl_PointCoord - .5; float a;
          if (shape < .5) a = smoothstep(.5, .1, length(q));                               // rond doux
          else if (shape < 1.5) a = step(max(abs(q.x), abs(q.y)), .32);                    // pixel carré
          else a = smoothstep(.5, 0., abs(q.x) * 6. + abs(q.y)) + smoothstep(.5, 0., abs(q.y) * 6. + abs(q.x)); // étincelle
          gl_FragColor = vec4(color, clamp(a, 0., 1.) * vA * alpha);
        }`,
    }));
    this.motes.frustumCulled = false;
    this.motes.userData.noAO = true;
    this.scene.add(this.motes);
  }

  // traînées de vitesse : segments qui filent le long de la direction de course, près de la caméra
  #buildStreaks(n) {
    const pos = new Float32Array(n * 6), tip = new Float32Array(n * 2), seed = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - .5) * 36, y = Math.random() * 12 - 1, z = Math.random() * 80, sd = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      tip.set([0, 1], i * 2);
      seed.set([sd, sd], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.streaks = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { origin: { value: new THREE.Vector3() }, fwd: { value: this.#fwd }, time: { value: 0 }, speed: { value: 0 }, amount: { value: 0 } },
      vertexShader: `
        attribute float tip, seed; uniform vec3 origin, fwd; uniform float time, speed; varying float vA;
        void main(){
          vec3 side = normalize(cross(fwd, vec3(0., 1., 0.)));
          float z = mod(position.z - time * speed * (1. + seed), 80.);   // défile vers l'arrière
          float len = 2. + speed * .12;
          vec3 p = origin + side * position.x + vec3(0., position.y, 0.) + fwd * (z - 10. + tip * len);
          vA = tip * smoothstep(0., 10., z) * (1. - smoothstep(55., 80., z)) * step(4., abs(position.x));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
        }`,
      fragmentShader: 'uniform float amount; varying float vA; void main(){ gl_FragColor = vec4(1., 1., 1., vA * amount * .5); }',
    }));
    this.streaks.frustumCulled = false;
    this.streaks.userData.noAO = true;
    this.scene.add(this.streaks);
  }

  update(dt, time) {
    const g = this.game, r = g.runner, cam = this.world.camera.position;
    const st = STYLES[g.zoneIndex % STYLES.length];
    const k = Math.min(1, dt * 1.2);
    this.#color.lerp(new THREE.Color(st.color), k);
    this.#drift.lerp(new THREE.Vector3(...st.drift), k);
    const u = this.motes.material.uniforms;
    u.cam.value.copy(cam); u.time.value = time;
    u.size.value += (st.size - u.size.value) * k; u.twinkle.value = st.twinkle; u.alpha.value += (st.alpha - u.alpha.value) * k;
    u.shape.value = st.shape;
    this.motes.visible = (this.world.enclosure ?? 0) < 0.6; // pas dans les tunnels

    // traînées : apparaissent au-delà de ~110 km/h, fort pendant le sprint
    const f = this.track.frame(r.z, this.#f);
    this.#fwd.set(Math.sin(f.th), 0, Math.cos(f.th));
    const su = this.streaks.material.uniforms;
    su.origin.value.set(cam.x, cam.y - 2, cam.z);
    su.time.value = time; su.speed.value = Math.max(0, r.speed) * 1.4;
    const target = g.state === 'playing' ? Math.min(1, Math.max(0, (r.speed - 30) / 20) + (r.boost > 0 ? 0.7 : 0)) : 0;
    su.amount.value += (target - su.amount.value) * Math.min(1, dt * 4);
    this.streaks.visible = su.amount.value > 0.02;
  }

  dispose() {
    super.dispose();
    for (const o of [this.motes, this.streaks]) { this.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
  }
}
