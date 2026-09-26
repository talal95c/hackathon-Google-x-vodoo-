import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { View } from './View.js';
import { ZONES } from '../content/zones.js';
import { TRACK } from '../kernel/config.js';
import { WORLD_JUMP, isWorldSafe } from '../kernel/WorldJourney.js';

const noise = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const UP = new THREE.Vector3(0, 1, 0);

// Five physical worlds, streamed with the road. Static pieces are merged per
// material/chunk; only hardware fans rotate. No gameplay RNG is consumed.
export class WorldDecorView extends View {
  chunks = new Map();
  signs = new Map();
  constructor(ctx) {
    super(ctx);
    const colors = [
      [0x8fa6b5, 0xe2e8e7, 0x344f60, 0x91a7b3, 0x64bbdf, 0x129cff, 0xffa338],
      [0xdce5ed, 0xffffff, 0x364358, 0x9eb7c9, 0x9ccfec, 0x268df3, 0xffbd47],
      [0x79a6cc, 0xe7f5ff, 0x214b71, 0x527da6, 0x2496f2, 0x4ec7ff, 0xffd058],
      [0x175445, 0x829599, 0x132728, 0x216755, 0x203a3f, 0x35edb5, 0xe6b75a],
      [0xd7eaf1, 0xffffff, 0x477787, 0xb4dce8, 0x9ce6ed, 0x23c4df, 0xffd87a],
    ];
    this.palettes = colors.map(row => Object.fromEntries(['base', 'white', 'dark', 'ground', 'glass', 'neon', 'gold'].map((name, i) => [name, new THREE.MeshStandardMaterial({
      color: row[i], roughness: name === 'glass' ? .22 : .58, metalness: name === 'glass' ? .24 : .06, flatShading: true,
      emissive: ['neon', 'gold'].includes(name) ? row[i] : 0, emissiveIntensity: name === 'neon' ? 2.4 : 1.6,
      side: THREE.DoubleSide,
    })])));
    this.palettes.forEach((palette, i) => { palette.accent = new THREE.MeshStandardMaterial({ color: colors[i][6], roughness: .65, flatShading: true }); });
    this.listen('chunk:remove', c => this.remove(c.index));
    this.update(0, 0);
  }

  label(text, color = '#a8deff') {
    const key = text + color;
    if (this.signs.has(key)) return this.signs.get(key);
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
    const c = canvas.getContext('2d');
    c.fillStyle = '#152b3b'; c.fillRect(0, 0, 768, 256);
    c.strokeStyle = color; c.lineWidth = 7; c.strokeRect(12, 12, 744, 232);
    c.fillStyle = color; c.font = 'bold 22px monospace'; c.textAlign = 'center';
    c.fillText('D I N O  /  E S C A P E', 384, 63);
    c.fillStyle = '#ffffff'; c.font = `900 ${text.length > 12 ? 45 : 66}px monospace`;
    c.fillText(text, 384, 155);
    c.fillStyle = color; c.font = 'bold 20px monospace'; c.fillText('→  KEEP RUNNING  →', 384, 211);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map, toneMapped: false, side: THREE.DoubleSide });
    this.signs.set(key, material); return material;
  }

  build(chunk) {
    if (ZONES[chunk.zone]?.site) { const empty = new THREE.Group(); empty.userData.fans = []; this.chunks.set(chunk.index, empty); return; } // monde généré : SiteDecorView
    const group = new THREE.Group(), buckets = new Map(), fans = [], track = this.track;
    const put = (key, geo, f, x, y, z, yaw = 0) => {
      geo.rotateY(yaw).translate(x, y, z).rotateY(f.th).translate(f.x, f.y, f.z);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(geo);
    };
    const box = (key, f, x, y, z, w, h, d, yaw = 0) => put(key, (w > 3 && h > 3 && d > .7 && ['white', 'dark', 'glass'].includes(key) ? new RoundedBoxGeometry(w, h, d, 1, .18) : new THREE.BoxGeometry(w, h, d)), f, x, y, z, yaw);
    const rock = (key, f, x, y, z, sx, sy, sz, detail = 0) => put(key, new THREE.IcosahedronGeometry(1, detail).scale(sx, sy, sz), f, x, y, z);
    const cylinder = (key, f, x, y, z, radius, height, top = radius, sides = 10) => put(key, new THREE.CylinderGeometry(top, radius, height, sides), f, x, y, z);
    const sign = (f, x, y, z, width, text) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 3), this.label(text));
      mesh.position.set(x, y, z).applyAxisAngle(UP, f.th).add(new THREE.Vector3(f.x, f.y, f.z));
      mesh.rotation.y = f.th + Math.PI; group.add(mesh);
    };
    const outline = (f, x, y, z, w, h, key = 'neon', thick = .19) => {
      for (const side of [-1, 1]) box(key, f, x + side * w / 2, y, z, thick, h, .22);
      for (const side of [-1, 1]) box(key, f, x, y + side * h / 2, z, w, thick, .22);
    };
    const tab = (f, x, y, z, w, h, title) => {
      box('dark', f, x, y, z, w + .5, h + .5, 1.1);
      box('white', f, x, y, z - .65, w, h, .3);
      box('glass', f, x, y + h / 2 - .8, z - .85, w, 1.6, .25);
      for (let k = 0; k < 3; k++) box(k === 0 ? 'gold' : 'neon', f, x - w / 2 + .9 + k * .65, y + h / 2 - .8, z - 1.03, .38, .38, .1);
      outline(f, x, y, z - .85, w + .4, h + .4);
      if (title) sign(f, x, y + .2, z - .94, w * .73, title);
      for (let k = 0; k < 3; k++) box('base', f, x, y - h / 2 + 1.2 + k * .7, z - .87, w * (.72 - k * .11), .22, .1);
    };

    // Sculpted platforms provide a ground plane, leaving the inter-world jump
    // completely open. The route boundaries remain physically visible.
    const ground = [], edge = [];
    const pt = (i, d, y) => [track.X[i] + Math.cos(track.TH[i]) * d, track.Y[i] + y, track.Z[i] - Math.sin(track.TH[i]) * d];
    const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...b, ...d, ...c);
    for (let i = chunk.i0; i < chunk.i1; i++) {
      if (isWorldSafe((i + .5) * TRACK.step)) continue;
      for (const side of [-1, 1]) {
        const a = side * (track.W[i] / 2 + 2), b = side * (track.W[i + 1] / 2 + 2);
        const width = chunk.zone === 4 ? 33 : 63;
        quad(ground, pt(i, a, -3.8), pt(i, side * width, -3.8), pt(i + 1, b, -3.8), pt(i + 1, side * width, -3.8));
        quad(edge, pt(i, a, -3.8), pt(i, a, -7), pt(i + 1, b, -3.8), pt(i + 1, b, -7));
      }
    }
    for (const [key, points] of [['ground', ground], ['base', edge]]) if (points.length) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      geometry.computeVertexNormals(); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(points.length / 3 * 2), 2));
      buckets.set(key, [geometry]);
    }

    for (let j = 0; j < 5; j++) {
      const s = chunk.s0 + 12 + j * 23;
      if (isWorldSafe(s)) continue;
      const f = track.frame(s, {}), seed = chunk.index * 57 + j * 17;
      for (const side of [-1, 1]) {
        const n = seed + (side > 0 ? 19 : 0), x = side * (f.w / 2 + 15 + noise(n) * 10);
        const wx = f.x + f.lx * x, wz = f.z + f.lz * x;
        if (track.clearance(wx, wz, s) < f.w / 2 + 13) continue;
        const h = 8 + noise(n + 1) * 13;
        const variant = (j + chunk.index + (side > 0 ? 1 : 0)) % 3;
        if (chunk.zone === 0) {
          // Three silhouettes: eroded arches, stepped mesas and an offline signal monument.
          if (variant === 0) {
            for (const dx of [-5.4, 5.4]) {
              rock('base', f, x + dx, 3.8, 2, 3.8, 10.4, 4.5);
              box('dark', f, x + dx, 3.1, -.7, 2.7, 12, 2);
              box('neon', f, x + dx - side * 1.4, 3.4, -1.78, .16, 10, .13);
            }
            rock('white', f, x, 12.1, 2, 9.2, 3.6, 4.1);
            box('gold', f, x, 10.8, -1.6, 10.6, .2, .2);
            sign(f, x, 7.5, -.9, 8.2, 'OFFLINE');
          } else if (variant === 1) {
            for (let layer = 0; layer < 4; layer++) {
              cylinder(layer % 2 ? 'white' : 'base', f, x + side * 7, -.4 + layer * 3.4, 3, 9 - layer * 1.15, 3.4, 8.3 - layer * 1.2, 5);
            }
            for (let k = 0; k < 3; k++) {
              const cx = x + (k - 1) * 3.1, cy = k * 1.2;
              box('dark', f, cx, cy, -4, 1.1, 5.8 + k, 1.1);
              box('dark', f, cx + 1.1, cy + 1, -4, 2.5, .9, .9);
              box('dark', f, cx + 2.05, cy + 1.9, -4, .8, 2, .9);
              box('neon', f, cx - .58, cy, -4.58, .12, 4.6 + k, .12);
            }
          } else {
            rock('white', f, x, -1.8, 0, 9, 4, 7);
            for (let ring = 0; ring < 3; ring++) put('neon', new THREE.TorusGeometry(2.2 + ring * 2, .23, 4, 12, Math.PI * .7).rotateZ(Math.PI * .15), f, x, 3.5, 0);
            rock('gold', f, x, 3.5, -.2, .85, .85, .85);
            box('dark', f, x - 2, 4.7, .5, .45, 13, .6, .6);
            sign(f, x, 11.5, -1, 9, 'NO SIGNAL');
            for (let k = 0; k < 4; k++) rock(k % 2 ? 'base' : 'white', f, x + (k - 1.5) * 3, -2.6, -5, 2.8, 2 + k, 2.4);
          }
          if (j % 2 === 0) rock('base', f, x + side * 18, 1, 7, 8, h * 1.2, 11);
          if (j % 2 === 1) {
            const cx = x - side * 7;
            box('dark', f, cx, -.6, -5, .85, 5.7, .85);
            box('dark', f, cx + side * 1.2, .1, -5, 2.4, .7, .8);
            box('dark', f, cx + side * 2.1, 1, -5, .7, 2.2, .8);
          }
        } else if (chunk.zone === 1) {
          // Pages become walls and tabs become beams. No conventional buildings.
          box('base', f, x, -2.8, 0, 15, 2, 13);
          if (variant === 0) {
            tab(f, x + side * 2, h / 2, 3, 13, h + 3, 'NEW TAB');
            tab(f, x - side * 3.4, 2.9, -4, 10, 9, '404');
          } else if (variant === 1) {
            for (let k = 0; k < 5; k++) box(k % 2 ? 'white' : 'glass', f, x, -1 + k * 1.4, 0, 13 - k * 1.2, 1, 10, (k - 2) * .12);
            tab(f, x, 10, 2, 14, 6, 'SEARCH');
            put('neon', new THREE.TorusGeometry(3.3, .28, 5, 18), f, x, 17, 2);
          } else {
            tab(f, x, 6.8, 2, 15, 15, 'DOWNLOAD');
            for (let k = 0; k < 5; k++) box('neon', f, x - 4 + k * 2, .2 + k * .4, -6, 1.25, 2 + k * .8, 1.25);
            box('glass', f, x, 14.5, 2, 3, 2, 1);
          }
          box('glass', f, x, -1.8, -7, 14, .5, 3);
          for (let k = 0; k < 3; k++) {
            cylinder('accent', f, x + side * (9 + k * .4), -1.5 + k * 1.2, 4, 3, .8, 3, 10);
            for (let q = 0; q < 3; q++) box('dark', f, x + side * 9 + Math.cos(q * 2) * 1.4, -1 + k * 1.2, 4 + Math.sin(q * 2) * 1.4, .55, .15, .55);
          }
        } else if (chunk.zone === 2) {
          // Oversized folders, desktop windows, taskbar tiles and keycaps.
          box('base', f, x, -2.7, 0, 16, 2.2, 15);
          if (variant === 0) {
          box('accent', f, x, 3.7, 1, 12, 10, 1.9);
          box('accent', f, x - 3.8, 9.3, 1, 4.4, 1.8, 1.9);
          box('white', f, x, 4.5, -.2, 10.8, 9.1, .3);
          box('accent', f, x, 2.6, -1.7, 12.8, 7.8, .7, -.07 * side);
          tab(f, x + side * 5, 10, 5, 11, 13, j % 2 ? 'SYSTEM' : 'DESKTOP');
          for (let k = 0; k < 4; k++) {
            box('dark', f, x - 6 + k * 4, -1.1, -6, 3.3, 1.3, 3.4);
            box('neon', f, x - 6 + k * 4, -.4, -6, 1.5, .13, 1.5);
          }
          } else if (variant === 1) {
            for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
              const cx = x + (col - 1) * 4;
              box('dark', f, cx, -1 + row * 1.2, (row - 1) * 4, 3.5, 2, 3.5);
              box('white', f, cx, .05 + row * 1.2, (row - 1) * 4, 3.2, .25, 3.2);
              box('neon', f, cx, -.8 + row * 1.2, (row - 1) * 4 - 1.79, 2.8, .16, .12);
            }
            tab(f, x, 11, 4, 13, 8, 'ESC');
          } else {
            cylinder('glass', f, x, 3, 0, 4.6, 12, 5.8, 8);
            cylinder('white', f, x, 9.1, 0, 6, .6, 6, 8);
            for (let k = 0; k < 4; k++) box('white', f, x - 3 + k * 2, 10 + k * .6, 0, 1.5, 4, 1, k * .15);
            sign(f, x, 3, -5.4, 8.5, 'RECYCLE');
            outline(f, x, 3, -5.52, 8.8, 3.2);
          }
          for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) box('glass', f, x + (a - .5) * 4.7, 19 + (b - .5) * 4.7, 5, 4.2, 4.2, .8);
        } else if (chunk.zone === 3) {
          // PCB islands, processors, copper tracks, capacitors and cooling fans.
          box('base', f, x, -2.8, 0, 19, 1.8, 20);
          box('dark', f, x, -.6, 0, 10, 2.6, 9);
          for (let k = 0; k < 9; k++) box('white', f, x - 4 + k, 3, 0, .45, 6, 8);
          for (const signSide of [-1, 1]) for (let k = 0; k < 7; k++) box('gold', f, x + signSide * 5.9, -1.1, -3.6 + k * 1.2, 1.8, .35, .42);
          for (const dx of [-7.4, 7.4]) {
            cylinder('dark', f, x + dx, 1.2, 5, 1.6, 7.6);
            cylinder('white', f, x + dx, 5.07, 5, 1.55, .2);
            box('gold', f, x + dx, 5.23, 5, 1.8, .1, .16);
          }
          for (let k = 0; k < 4; k++) {
            box('neon', f, x - 8 + k * 4.5, -1.81, -6.4, .17, .06, 6.2);
            box('neon', f, x - 6 + k * 4.5, -1.81, -9.4, 4.1, .06, .17);
          }
          sign(f, x, 7.5, -4.2, 8, j % 2 ? 'CPU' : 'RAM');
          if (variant === 0) {
          box('dark', f, x, 12, 2.5, 9.4, 9.4, .65);
          for (const dx of [-4.2, 4.2]) box('white', f, x + dx, 5.4, 2.6, .65, 13.6, .85);
          const fan = new THREE.Group();
          for (let blade = 0; blade < 6; blade++) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.8, .3), this.palettes[3].dark);
            const a = blade * Math.PI / 3; mesh.position.set(Math.sin(a) * 1.9, Math.cos(a) * 1.9, 0); mesh.rotation.z = -a + .3; fan.add(mesh);
          }
          fan.position.set(x, 12, 2).applyAxisAngle(UP, f.th).add(new THREE.Vector3(f.x, f.y, f.z)); fan.rotation.y = f.th; group.add(fan); fans.push(fan);
          put('neon', new THREE.TorusGeometry(4.2, .25, 4, 20), f, x, 12, 2);
          } else if (variant === 1) {
            for (let k = 0; k < 3; k++) {
              box('base', f, x - 4 + k * 4, 8, 3 + k, 2.4, 19, 1);
              for (let chip = 0; chip < 5; chip++) box('dark', f, x - 4 + k * 4, 1 + chip * 3.1, 2.4 + k, 1.8, 2.3, .3);
              box('neon', f, x - 5.25 + k * 4, 8, 2.4 + k, .14, 18, .12);
            }
          } else {
            for (let k = 0; k < 7; k++) put('accent', new THREE.TorusGeometry(3.9, .47, 6, 16), f, x, 6, -2 + k * 1.1);
            box('dark', f, x, 6, 1.5, 3, 3, 11);
            for (const dx of [-5, 5]) cylinder('white', f, x + dx, 4, 3, 2, 15);
            box('neon', f, x, -1.6, -6, 16, .12, .23);
          }
        } else {
          // The road reaches floating cloud banks and luminous data centres.
          for (let k = 0; k < 5; k++) rock('white', f, x + (k - 2) * 4, -3 + Math.sin(k * 2) * 1.5, Math.cos(k) * 2, 5.5, 4, 5, 1);
          for (let k = 0; k < (variant === 0 ? 3 : 1); k++) {
            const cx = x + (k - 1) * 4;
            box('white', f, cx, 3.7 + k, 1, 3.3, 12 + k * 2, 4);
            box('dark', f, cx, 4 + k, -1.1, 2.8, 9 + k * 2, .15);
            for (let row = 0; row < 5; row++) {
              box('glass', f, cx, .2 + row * 1.8, -1.25, 2.2, 1, .14);
              box('neon', f, cx + .8, .2 + row * 1.8, -1.36, .18, .18, .1);
            }
          }
          if (variant !== 0) {
            for (let k = 0; k < 3; k++) put(k % 2 ? 'white' : 'neon', new THREE.TorusGeometry(5 + k * 1.5, k % 2 ? .7 : .17, 5, 18, Math.PI).rotateZ(.1), f, x + 2, 4, -2 + k * 3);
            for (let k = 0; k < 4; k++) rock('glass', f, x + (k - 1) * 3, 8 + Math.sin(k) * 2, -3, 1, 1, 1);
          }
          put('neon', new THREE.TorusGeometry(6.2, .22, 4, 24), f, x, 17, 2);
          rock('white', f, x, 17, 2, 3, 2.3, 2.6, 1);
          rock('white', f, x - 2.5, 16, 2, 2.5, 2, 2, 1);
          rock('white', f, x + 2.5, 16, 2, 2.5, 2, 2, 1);
          if (j % 2 === 0) sign(f, x, 9, -2, 9, 'CLOUD');
        }
      }
      // Close markers provide parallax and rhythm without filling the sky.
      for (const side of [-1, 1]) {
        const x = side * (f.w / 2 + 1.5);
        box('dark', f, x, -.6, 0, .35, 1.2, .45);
        box(chunk.zone === 0 ? 'gold' : 'neon', f, x, .07, 0, .45, .15, 1.7);
      }
    }

    // A literal doorway through the next computer layer, suspended in the gap.
    for (let number = 1; number < ZONES.length; number++) {
      const boundary = number * TRACK.zoneLength;
      if (boundary < chunk.s0 || boundary >= chunk.s1) continue;
      const f = track.frame(boundary, {}), y = WORLD_JUMP.height + 2;
      const w = 21, h = 14;
      for (const side of [-1, 1]) {
        box('dark', f, side * w / 2, y, 0, 1.1, h + 1, 2);
        box('dark', f, 0, y + side * h / 2, 0, w + 1, 1.1, 2);
      }
      outline(f, 0, y, -1.08, w - .2, h - .2, 'neon', .3);
      sign(f, 0, y + h / 2 + 2.7, -.5, 16, ZONES[number].name);
      // The two ends look like luminous launch and landing pads.
      for (const delta of [-WORLD_JUMP.lead - 3, WORLD_JUMP.tail + 3]) {
        const landing = track.frame(boundary + delta, {});
        box('dark', landing, 0, -.2, 0, landing.w + .7, .42, 9);
        for (let k = 0; k < 4; k++) box('neon', landing, 0, .035, -3 + k * 2, landing.w * .9, .08, .23);
      }
    }
    for (const [key, geometries] of buckets) {
      const normalized = geometries.map(g => g.index ? g.toNonIndexed() : g);
      const merged = mergeGeometries(normalized);
      new Set([...geometries, ...normalized]).forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, this.palettes[chunk.zone][key]);
      mesh.castShadow = !['neon', 'gold', 'ground'].includes(key);
      mesh.receiveShadow = !['neon', 'gold'].includes(key); group.add(mesh);
    }
    group.userData.fans = fans;
    this.scene.add(group); this.chunks.set(chunk.index, group);
  }

  remove(index) {
    const group = this.chunks.get(index); if (!group) return;
    group.removeFromParent(); group.traverse(object => object.geometry?.dispose()); this.chunks.delete(index);
  }
  update(dt, time) {
    // The full route ahead is already generated when these chunks become visible.
    for (const chunk of this.track.chunks) if (!this.chunks.has(chunk.index) && chunk.s0 < this.game.runner.z + 310) this.build(chunk);
    for (const palette of this.palettes) {
      palette.neon.emissiveIntensity = 2.1 + (this.ctx.fx?.pulse ?? 0) * 1.35;
      palette.gold.emissiveIntensity = 1.5 + (this.ctx.fx?.down ?? 0) * .9;
    }
    for (const group of this.chunks.values()) for (const fan of group.userData.fans) fan.rotation.z += dt * 3.5;
  }
  dispose() {
    super.dispose();
    for (const index of [...this.chunks.keys()]) this.remove(index);
    for (const palette of this.palettes) Object.values(palette).forEach(material => material.dispose());
    for (const material of this.signs.values()) { material.map.dispose(); material.dispose(); }
  }
}
