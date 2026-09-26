import * as THREE from 'three';
import { ZONES } from '../content/zones.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PostProcessing } from './PostProcessing.js';

// Le "plateau" : renderer, scène, caméra, ciel en dégradé, nuages, lumières.
// Les couleurs suivent la palette de la zone courante (transition douce).
export class World {
  constructor(container = document.body) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio, window.matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5);
    r.setPixelRatio(this.pixelRatio);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = .96;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.setAttribute('aria-label', 'Dino Race Fight Club — 3D scene');
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    container.prepend(r.domElement);

    const p = ZONES[0].palette;
    this.colors = {
      sky: new THREE.Color(p.sky), skyTop: new THREE.Color(p.skyTop),
      cloud: new THREE.Color(p.cloud), sun: new THREE.Color(p.sun),
    };
    this.palette = p;
    this.scene = new THREE.Scene();
    this.scene.background = this.colors.sky;
    this.scene.fog = new THREE.Fog(this.colors.sky, 105, 320);
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 400);

    this.#buildSky();
    this.#buildClouds();
    this.#buildLights();
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(r);
    this.environmentTarget = pmrem.fromScene(room, .04);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = .28;
    room.dispose(); pmrem.dispose();
    this.post = new PostProcessing(r, this.scene, this.camera);
    this.post.resize(window.innerWidth, window.innerHeight, this.pixelRatio);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      r.setSize(window.innerWidth, window.innerHeight);
      this.post.resize(window.innerWidth, window.innerHeight, this.pixelRatio);
    });
  }

  setPalette(palette) { this.palette = palette; }

  #buildSky() {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(380, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: this.colors.skyTop }, bottom: { value: this.colors.sky } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = smoothstep(-0.05, 0.55, vP.y); gl_FragColor = vec4(mix(bottom, top * .78, h), 1.0); }',
      }),
    );
    this.sky.renderOrder = -1;
    this.sky.userData.noAO = true;
    this.scene.add(this.sky);
  }

  #buildClouds() {
    const mat = new THREE.MeshLambertMaterial({ color: this.colors.cloud, emissive: this.colors.cloud, emissiveIntensity: 0.6, flatShading: true, fog: false });
    this.cloudMaterial = mat;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, mat);
        const s = 5 + Math.random() * 7;
        m.scale.set(s * 1.3, s, s);
        m.position.set((k - n / 2) * 7 + Math.random() * 3, Math.random() * 3 - (k === 0 || k === n - 1) * 3, Math.random() * 4);
        g.add(m);
      }
      this.clouds.push({ g, a: (i / 14) * Math.PI * 2 + Math.random() * 0.3, r: 170 + Math.random() * 110, y: 35 + Math.random() * 45 });
      this.scene.add(g);
    }
  }

  #buildLights() {
    this.ambient = new THREE.HemisphereLight(0xb6c7ef, 0x987259, .92);
    this.scene.add(this.ambient);
    const sun = this.sun = new THREE.DirectionalLight(this.colors.sun, 2.65);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = .045;
    sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 120 });
    this.scene.add(sun, sun.target);
  }

  // focus : point suivi par l'ombre du soleil (le dino)
  update(dt, focus) {
    const k = Math.min(1, dt * 1.5), p = this.palette, c = this.colors;
    c.sky.lerp(tmp.setHex(p.sky), k);
    c.skyTop.lerp(tmp.setHex(p.skyTop), k);
    c.cloud.lerp(tmp.setHex(p.cloud), k);
    this.sun.color.lerp(tmp.setHex(p.sun), k);
    this.scene.fog.color.copy(c.sky);
    document.body.style.background = `#${c.sky.getHexString()}`;

    this.cloudMaterial.color.copy(c.cloud);
    this.cloudMaterial.emissive.copy(c.cloud);
    const cam = this.camera.position;
    this.sky.position.copy(cam);
    for (const cl of this.clouds) {
      cl.g.visible = p.clouds !== false;
      cl.a += dt * 0.004;
      cl.g.position.set(cam.x + Math.cos(cl.a) * cl.r, cl.y, cam.z + Math.sin(cl.a) * cl.r);
      cl.g.lookAt(cam.x, cl.y, cam.z);
    }
    const inside = this.enclosure ?? 0;
    this.ambient.intensity = .92 - inside * .53;
    this.sun.intensity = 2.65 - inside * 2.1;
    this.scene.environmentIntensity = .28 - inside * .13;
    this.sun.position.set(focus.x + 25, focus.y + 32, focus.z - 18);
    this.sun.target.position.copy(focus);
  }

  // fx : effets de vitesse calculés par view/TransitionFx.js
  render(pulse = 0, fx) { this.post.render(pulse, fx); }
}

const tmp = new THREE.Color();
