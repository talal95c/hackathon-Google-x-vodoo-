import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { View } from './View.js';
import { ZONES } from '../content/zones.js';
import { TRACK } from '../kernel/config.js';
import { WORLD_JUMP, isWorldSafe, boundariesIn } from '../kernel/WorldJourney.js';

import { createSculpture, sculptureRecipe } from './UniverseSculptures.js';

const UP = new THREE.Vector3(0, 1, 0);

// Five surreal sets, streamed with the road. Static geometry is merged per
// material/chunk; kinetic sculptures animate independently of gameplay RNG.
export class WorldDecorView extends View {
  chunks = new Map();
  signs = new Map();
  constructor(ctx) {
    super(ctx);
    const colors = ZONES.map(zone => zone.scenery);
    this.palettes = colors.map(row => Object.fromEntries(['base', 'white', 'dark', 'ground', 'glass', 'neon', 'gold'].map((name, i) => [name, new THREE.MeshStandardMaterial({
      color: row[i], roughness: name === 'glass' ? .7 : .9, metalness: 0, envMapIntensity: .15, flatShading: true,
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
    const group = new THREE.Group(), buckets = new Map(), kinetics = [], track = this.track;
    const put = (key, geo, f, x, y, z, yaw = 0) => {
      geo.rotateY(yaw).translate(x, y, z).rotateY(f.th).translate(f.x, f.y, f.z);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(geo);
    };
    const box = (key, f, x, y, z, w, h, d, yaw = 0) => put(key, (Math.min(w,h,d) > .6 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(.38,Math.min(w,h,d)*.18)) : new THREE.BoxGeometry(w, h, d)), f, x, y, z, yaw);
    const sign = (f, x, y, z, width, text) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 3), this.label(text));
      mesh.position.set(x, y, z).applyAxisAngle(UP, f.th).add(new THREE.Vector3(f.x, f.y, f.z));
      mesh.rotation.y = f.th + Math.PI; group.add(mesh);
    };
    const outline = (f, x, y, z, w, h, key = 'neon', thick = .19) => {
      for (const side of [-1, 1]) box(key, f, x + side * w / 2, y, z, thick, h, .22);
      for (const side of [-1, 1]) box(key, f, x, y + side * h / 2, z, w, thick, .22);
    };
    // Sculpted platforms provide a ground plane, leaving the inter-world jump
    // completely open. The route boundaries remain physically visible.
    const ground = [], edge = [];
    const drop=[7,10,6,18,14][chunk.zone];
    const pt = (i, d, y) => [track.X[i] + Math.cos(track.TH[i]) * d, track.Y[i] + y, track.Z[i] - Math.sin(track.TH[i]) * d];
    const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...b, ...d, ...c);
    const width = chunk.zone === 4 ? 39 : 62;
    // Une bande de sol s'arrête avant de recroiser la route plus loin (virage en U) :
    // sinon, si la route a descendu entre-temps, le sol dépasserait au-dessus de la chaussée.
    const reach = (i, side) => {
      const nx = Math.cos(track.TH[i]) * side, nz = -Math.sin(track.TH[i]) * side;
      const j0 = Math.max(0, i - 160), j1 = Math.min(track.X.length - 1, i + 160);
      let d = track.W[i] / 2 + .5;
      for (; d + 3 < width; d += 3) {
        const x = track.X[i] + nx * (d + 3), z = track.Z[i] + nz * (d + 3);
        for (let j = j0; j <= j1; j += 2) {
          if (Math.abs(j - i) <= 4 || track.Y[j] > track.Y[i] - .1) continue;
          if (Math.hypot(track.X[j] - x, track.Z[j] - z) < track.W[j] / 2 + 3) return d;
        }
      }
      return width;
    };
    const reaches = { '-1': new Map(), 1: new Map() };
    const far = (i, side) => { const m = reaches[side]; if (!m.has(i)) m.set(i, reach(i, side)); return m.get(i); };
    for (let i = chunk.i0; i < chunk.i1; i++) {
      if (isWorldSafe((i + .5) * TRACK.step)) continue;
      for (const side of [-1, 1]) {
        const a = side * (track.W[i] / 2 + 7), b = side * (track.W[i + 1] / 2 + 7);
        if(far(i,side)<Math.abs(a)||far(i+1,side)<Math.abs(b))continue;
        // Valleys below the deck reveal the road's shape and bridge supports.
        const dip=drop+Math.sin(i*.04)*2, nextDip=drop+Math.sin((i+1)*.04)*2;
        quad(ground, pt(i, a, -dip), pt(i, side * far(i, side), -dip), pt(i + 1, b, -nextDip), pt(i + 1, side * far(i + 1, side), -nextDip));
        quad(edge, pt(i, a, -dip), pt(i, a, -dip-3), pt(i + 1, b, -nextDip), pt(i + 1, b, -nextDip-3));
      }
    }
    for (const [key, points] of [['ground', ground], ['base', edge]]) if (points.length) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      geometry.computeVertexNormals(); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(points.length / 3 * 2), 2));
      buckets.set(key, [geometry]);
    }

    // Un décor occupe jusqu'à ±16 m de large et ±10 m de long autour de son ancre (dx > 0 =
    // vers l'extérieur) : aucun point de cette emprise ne doit tomber sur un autre tronçon de
    // route (virage en U, épingle), sinon le décor dépasserait sur la chaussée.
    const roadFree = (f, i, x, side, dxs = [-16, 0, 16], dzs = [-10, 0, 10]) => {
      const j0 = Math.max(0, i - 160), j1 = Math.min(track.X.length - 1, i + 160), fx = Math.sin(f.th), fz = Math.cos(f.th);
      for (const dx of dxs) for (const dz of dzs) {
        const px = f.x + f.lx * (x + side * dx) + fx * dz, pz = f.z + f.lz * (x + side * dx) + fz * dz;
        for (let j = j0; j <= j1; j += 2) {
          if (Math.abs(j - i) <= 10) continue;
          if (Math.hypot(track.X[j] - px, track.Z[j] - pz) < track.W[j] / 2 + 2) return false;
        }
      }
      return true;
    };
    // Unpaired anchors, variable scale, depth and silhouettes: each side is a
    // composition, rather than the same row of objects mirrored across the road.
    for (let j = 0; j < 4; j++) for (const side of [-1, 1]) {
      const recipe = sculptureRecipe(track.salt, chunk.index, j, side);
      const s = chunk.s0 + 14 + j * 28 + recipe.offset;
      if (isWorldSafe(s)) continue;
      const f = track.frame(s, {}), i = Math.round(s / TRACK.step);
      const wide = Math.max(...track.W.slice(Math.max(0, i - 9), i + 10));
      const x = side * (wide / 2 + 18 + recipe.spacing);
      if (track.clearance(f.x+f.lx*x, f.z+f.lz*x, s) < f.w/2+15 || !roadFree(f,i,x,side)) continue;
      const sculpture = createSculpture(chunk.zone, recipe.variant, recipe.seed, this.palettes[chunk.zone]);
      for (const [key, geos] of sculpture.pieces) for (const geo of geos) {
        geo.scale(recipe.scale,recipe.scale,recipe.scale).rotateY(recipe.yaw);
        put(key,geo,f,x,0,0);
      }
      const carrier = new THREE.Group(); carrier.position.set(x,0,0).applyAxisAngle(UP,f.th).add(new THREE.Vector3(f.x,f.y,f.z));
      carrier.rotation.y=f.th+recipe.yaw; carrier.scale.setScalar(recipe.scale);
      for(const mesh of sculpture.motion) {
        mesh.userData.baseY=mesh.position.y; mesh.userData.baseRotation=mesh.rotation.y;
        carrier.add(mesh); kinetics.push(mesh);
      }
      if(carrier.children.length) group.add(carrier);
    }

    // A luminous cut between two surreal sets, suspended in the gap.
    for (const boundary of boundariesIn(chunk)) {
      const f = track.frame(boundary, {}), y = WORLD_JUMP.height + 2;
      const w = 21, h = 14;
      for (const side of [-1, 1]) {
        box('dark', f, side * w / 2, y, 0, 1.1, h + 1, 2);
        box('dark', f, 0, y + side * h / 2, 0, w + 1, 1.1, 2);
      }
      outline(f, 0, y, -1.08, w - .2, h - .2, 'neon', .3);
      sign(f, 0, y + h / 2 + 2.7, -.5, 16, ZONES[track.zoneIndex(boundary)].name);
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
    group.userData.kinetics = kinetics;
    this.scene.add(group); this.chunks.set(chunk.index, group);
  }

  remove(index) {
    const group = this.chunks.get(index); if (!group) return;
    group.removeFromParent(); group.traverse(object => object.geometry?.dispose()); this.chunks.delete(index);
  }
  update(dt, time) {
    // The full route ahead is already generated when these chunks become visible.
    for (const chunk of this.track.chunks) if (!this.chunks.has(chunk.index) && chunk.s0 < this.game.runner.z + 310) this.build(chunk);
    this.palettes.forEach((palette,i)=>{
      const sunset=ZONES[i].palette.sunset;
      palette.neon.emissiveIntensity = (sunset?3.2:1.35) + (this.ctx.fx?.pulse ?? 0) * .35;
      palette.gold.emissiveIntensity = (sunset?2.2:1.15) + (this.ctx.fx?.down ?? 0) * .3;
    });
    for (const group of this.chunks.values()) for (const mesh of group.userData.kinetics) {
      const m=mesh.userData.motion;
      mesh.rotation.y=mesh.userData.baseRotation+time*m.spin;
      mesh.position.y=mesh.userData.baseY+Math.sin(time*1.15+m.phase)*m.bob;
    }
  }
  dispose() {
    super.dispose();
    for (const index of [...this.chunks.keys()]) this.remove(index);
    for (const palette of this.palettes) Object.values(palette).forEach(material => material.dispose());
    for (const material of this.signs.values()) { material.map.dispose(); material.dispose(); }
  }
}
