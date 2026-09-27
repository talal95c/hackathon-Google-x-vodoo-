import * as THREE from 'three';
import { ZONES } from '../content/zones.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
      sky: new THREE.Color(p.sky), skyMid: new THREE.Color(p.skyMid ?? p.sky), skyTop: new THREE.Color(p.skyTop),
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

  // Three-stop sunset gradient, low warm sun and drifting clouds. The sun is
  // colour-blended into the sky, keeping its disc below the neon bloom threshold.
  #buildSky() {
    this.skyUniforms = {
      top: { value: this.colors.skyTop }, middle: { value: this.colors.skyMid }, bottom: { value: this.colors.sky },
      sunColor: { value: new THREE.Color(0xfff1d0) }, sunDir: { value: new THREE.Vector3(-0.35, 0.2, 1).normalize() },
      cirrus: { value: this.colors.cloud }, time: { value: 0 },
      sunset: { value: 0 }, sunStrength: { value: 1 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(380, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: this.skyUniforms,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform vec3 top, middle, bottom, sunColor, sunDir, cirrus; uniform float time, sunset, sunStrength; varying vec3 vP;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
          float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= .5; } return v; }
          void main(){
            vec3 d = normalize(vP);
            float h = smoothstep(-0.05, 0.55, d.y);
            vec3 c = mix(bottom, top * .78, h);
            vec3 evening=mix(bottom,middle,smoothstep(-.04,.22,d.y));
            evening=mix(evening,top,smoothstep(.17,.78,d.y));
            c=mix(c,evening,sunset);
            // brume lumineuse à l'horizon, teintée par le soleil
            float sd = max(dot(d, sunDir), 0.);
            c += sunColor * pow(1. - abs(d.y), 6.) * .18 * (.4 + sd) * (1.-sunset) * sunStrength;
            // voiles de cirrus (projetés sur un plafond, défilent lentement)
            if (d.y > 0.02) {
              vec2 uv = d.xz / (d.y + .25) * 1.6 + vec2(time * .006, time * .0025);
              float w = smoothstep(.52, .82, fbm(uv * vec2(1., 3.2)));
              c = mix(c, cirrus * 1.05 + sunColor * sd * .15, w * .42 * smoothstep(.02, .3, d.y) * (1.-sunset*.3));
            }
            // soleil : disque + halo (valeurs > 1 → bloom)
            c += sunColor * (smoothstep(.9985, .9993, sd) * 2.2 + pow(sd, 350.) * 1.1 + pow(sd, 18.) * .22) * (1.-sunset) * sunStrength;
            // Warm low sun: no white hot core, lens flare or screen overlay.
            float disc=smoothstep(.9968,.9975,sd)*smoothstep(-.025,.015,d.y);
            c=mix(c,sunColor*.95,disc*sunset*.96);
            c+=sunColor*pow(sd,90.)*.07*sunset;
            gl_FragColor = vec4(c, 1.);
          }`,
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
      const pieces = [];
      const n = 4 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) {
        const s = 5 + Math.random() * 7;
        pieces.push(geo.clone().scale(s*1.3,s,s).translate((k-n/2)*7+Math.random()*3,Math.random()*3-(k===0||k===n-1)*3,Math.random()*4));
      }
      const g = new THREE.Mesh(mergeGeometries(pieces), mat);
      pieces.forEach(piece=>piece.dispose());
      g.userData.noAO = true;
      this.clouds.push({ g, a: (i / 14) * Math.PI * 2 + Math.random() * 0.3, r: 170 + Math.random() * 110, y: 35 + Math.random() * 45 });
      this.scene.add(g);
    }
    geo.dispose();
  }

  #buildLights() {
    this.ambient = new THREE.HemisphereLight(0xb6c7ef, 0x987259, .92);
    this.scene.add(this.ambient);
    const sun = this.sun = new THREE.DirectionalLight(this.colors.sun, 2.65);
    sun.castShadow = true;
    const size = window.matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = .045;
    sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 120 });
    this.scene.add(sun, sun.target);
    // Broad camera-side fill keeps the dino and hazards readable at sunset.
    // No extra shadow map or moving pool of glare on the track.
    this.fill = new THREE.DirectionalLight(0x91b8eb, 0);
    this.scene.add(this.fill, this.fill.target);
  }

  // focus : point suivi par l'ombre du soleil (le dino)
  update(dt, focus) {
    const k = Math.min(1, dt * 1.5), p = this.palette, c = this.colors;
    c.sky.lerp(tmp.setHex(p.sky), k);
    c.skyMid.lerp(tmp.setHex(p.skyMid ?? p.sky), k);
    c.skyTop.lerp(tmp.setHex(p.skyTop), k);
    c.cloud.lerp(tmp.setHex(p.cloud), k);
    this.sun.color.lerp(tmp.setHex(p.sun), k);
    this.sunset = THREE.MathUtils.lerp(this.sunset ?? 0, p.sunset ? 1 : 0, k);
    this.softLight = THREE.MathUtils.lerp(this.softLight ?? 0, p.softLight ? 1 : 0, k);
    this.scene.fog.color.copy(c.sky);
    document.body.style.background = `#${c.sky.getHexString()}`;

    this.cloudMaterial.color.copy(c.cloud);
    this.cloudMaterial.emissive.copy(c.cloud);
    this.cloudMaterial.emissiveIntensity = .6-this.sunset*.28;
    const cam = this.camera.position;
    this.sky.position.copy(cam);
    // The sunset warms the horizon while the playable deck retains soft fill.
    const u = this.skyUniforms;
    u.time.value += dt;
    u.sunColor.value.copy(this.sun.color);
    u.sunset.value = this.sunset;
    u.sunStrength.value = 1 - this.softLight * .78;
    u.sunDir.value.set(-.35, .2 + this.softLight*.38 - this.sunset*.10, 1).normalize();
    for (const cl of this.clouds) {
      cl.g.visible = p.clouds !== false;
      cl.g.scale.y = 1-this.sunset*.48;
      cl.a += dt * 0.004;
      cl.g.position.set(cam.x + Math.cos(cl.a) * cl.r, cl.y, cam.z + Math.sin(cl.a) * cl.r);
      cl.g.lookAt(cam.x, cl.y, cam.z);
    }
    const inside = this.enclosure ?? 0;
    const sunset = this.sunset, soft = this.softLight;
    this.ambient.color.lerp(tmp.setHex(p.sunset ? 0xd4c4e9 : 0xb6c7ef), k);
    this.ambient.groundColor.lerp(tmp.setHex(p.sunset ? 0x997d85 : 0x987259), k);
    this.ambient.intensity = (.92 + sunset*.08) * (1-inside*.4);
    this.sun.intensity = THREE.MathUtils.lerp(2.65-soft*.95, 1.7, sunset) * (1-inside*.7);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(.22-soft*.1, .14, sunset) * (1-inside*.45);
    this.fill.intensity = sunset*.35*(1-inside*.4);
    this.fill.position.set(cam.x, cam.y+10, cam.z);
    this.fill.target.position.copy(focus);
    this.post.setAtmosphere(sunset, soft);
    this.sun.position.set(focus.x + 25, focus.y + 32, focus.z - 18);
    this.sun.target.position.copy(focus);
  }

  // fx : effets de vitesse calculés par view/TransitionFx.js
  render(pulse = 0, fx) { this.post.render(pulse, fx); }

  // Qualité adaptative : si l'image tombe sous ~48 i/s pendant 1,5 s, on baisse la résolution, puis les ombres.
  adapt(dt) {
    if (!(dt > 0) || dt > 0.5) return;
    this.frameAvg = (this.frameAvg ?? 1 / 60) * 0.95 + dt * 0.05;
    this.slowFor = this.frameAvg > 1 / 48 ? (this.slowFor ?? 0) + dt : 0;
    if (this.slowFor < 1.5) return;
    this.slowFor = 0;
    this.frameAvg = 1 / 60;
    if (this.pixelRatio > 0.75) {
      this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.post.resize(window.innerWidth, window.innerHeight, this.pixelRatio);
    } else if (this.sun.castShadow) {
      this.sun.castShadow = false;
    }
  }
}

const tmp = new THREE.Color();
