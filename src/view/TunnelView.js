import { intersectsWorldSafe } from '../kernel/WorldJourney.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { View } from './View.js';
import { ZONES } from '../content/zones.js';

const COLORS = [0xffba67, 0xaa8bff, 0x55cfff, 0x46efb6, 0x75e4df];

// Keep roofs away from the aerial transitions and tight hairpins. The route is
// already generated before a visible chunk is built; no gameplay RNG is used.
export function tunnelSpan(track, chunk) {
  if (ZONES[chunk.zone]?.site) return null;
  if (![1, 3].includes((chunk.index + (track.salt || 0)) % 6)) return null; // position des tunnels : change à chaque partie
  const start = chunk.s0 + 18, end = chunk.s1 - 10;
  if (intersectsWorldSafe(start - 24, end + 24)) return null; // jamais sur un saut entre deux mondes
  if (track.hardTurns.some(turn => turn.s < end + 24 && turn.end > start - 24)) return null;
  return { start, end, zone: chunk.zone };
}

export class TunnelView extends View {
  chunks = new Map();
  constructor(ctx) {
    super(ctx);
    const shells = [0x775044, 0x544f79, 0x294769, 0x183f3b, 0x48868c];
    this.materials = shells.map((color, i) => ({
      shell: new THREE.MeshStandardMaterial({ color, roughness: .83, side: THREE.DoubleSide, flatShading: true }),
      rib: new THREE.MeshStandardMaterial({ color: [0xd3a886,0xaaa4cb,0x7bacc9,0x4f786b,0xc2e4df][i], roughness: .72 }),
      light: new THREE.MeshStandardMaterial({ color: COLORS[i], emissive: COLORS[i], emissiveIntensity: 3.2, roughness: .45 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x293b42, roughness: .75 }),
    }));
    this.lights = [-9, 11].map(() => { const l = new THREE.PointLight(0xffba67, 0, 38, 2); this.scene.add(l); return l; });
    this.listen('chunk:remove', c => this.remove(c.index));
    this.update(0, 0);
  }

  build(chunk) {
    const span = tunnelSpan(this.track, chunk);
    const root = new THREE.Group(); root.userData.span = span;
    this.chunks.set(chunk.index, root);
    if (!span) return;
    const buckets = new Map(), wall = [];
    const put = (key, geometry) => { if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(geometry); };
    const point = (f, x, y) => new THREE.Vector3(f.x + f.lx * x, f.y + y, f.z + f.lz * x);
    const profile = f => {
      const r = f.w / 2 + 3.3, points = [[r, -.8], [r, 3.4]];
      for (let k = 1; k <= 10; k++) { const a = k * Math.PI / 10; points.push([Math.cos(a) * r, 3.4 + Math.sin(a) * 10.8]); }
      points.push([-r, -.8]); return points;
    };
    const bar = (key, a, b, width, depth = width) => {
      const delta = b.clone().sub(a), geometry = new THREE.BoxGeometry(width, delta.length(), depth);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), delta.normalize()));
      geometry.translate(...a.clone().add(b).multiplyScalar(.5).toArray()); put(key, geometry);
    };
    for (let s = span.start; s < span.end; s += 2) {
      const f = this.track.frame(s, {}), next = this.track.frame(Math.min(span.end, s + 2), {});
      const pa = profile(f), pb = profile(next);
      for (let k = 0; k < pa.length - 1; k++) {
        const a = point(f, ...pa[k]).toArray(), b = point(f, ...pa[k+1]).toArray();
        const c = point(next, ...pb[k]).toArray(), d = point(next, ...pb[k+1]).toArray();
        wall.push(...a,...b,...c,...b,...d,...c);
      }
      for (const side of [-1,1]) {
        const x = side * (f.w / 2 + .8), nx = side * (next.w / 2 + .8);
        bar('dark', point(f,x,.2), point(next,nx,.2), .48, .48);
        bar('light', point(f,x,.49), point(next,nx,.49), .12, .12);
        // A second light line follows the wall through every bend.
        bar('light', point(f,side*(f.w/2+3.05),2.15), point(next,side*(next.w/2+3.05),2.15), .14, .14);
      }
    }
    const shell = new THREE.BufferGeometry(); shell.setAttribute('position', new THREE.Float32BufferAttribute(wall,3)); shell.computeVertexNormals(); put('shell',shell);
    const rings = [];
    for (let s = span.start; s < span.end; s += 8) rings.push(s);
    rings.push(span.end);
    rings.forEach((s, index) => {
      const f = this.track.frame(s, {}), p = profile(f), entrance = index === 0 || index === rings.length-1;
      for (let k = 0; k < p.length - 1; k++) {
        bar('rib', point(f,...p[k]), point(f,...p[k+1]), entrance ? .85 : .32, entrance ? 1.1 : .36);
        if (k > 0 && k < p.length - 2) {
          const inner = ([x,y]) => point(f,x*.974,3.4+(y-3.4)*.974);
          bar('light',inner(p[k]),inner(p[k+1]),entrance ? .20 : .10,.15);
        }
      }
    });
    for (const [key, pieces] of buckets) {
      const normalized = pieces.map(g => g.index ? g.toNonIndexed() : g);
      const mesh = new THREE.Mesh(mergeGeometries(normalized), this.materials[chunk.zone][key]);
      new Set([...pieces,...normalized]).forEach(g => g.dispose());
      mesh.castShadow = key !== 'light'; mesh.receiveShadow = key !== 'light'; root.add(mesh);
    }
    this.scene.add(root);
  }

  update(dt) {
    const s = this.game.runner.z;
    for (const chunk of this.track.chunks) if (!this.chunks.has(chunk.index) && chunk.s0 < s + 280) this.build(chunk);
    let amount = 0, zone = this.game.zoneIndex;
    for (const root of this.chunks.values()) {
      const span = root.userData.span; if (!span || s < span.start || s > span.end) continue;
      const t = Math.min(1, (s-span.start)/10, (span.end-s)/12);
      amount = t*t*(3-2*t); zone = span.zone;
    }
    this.world.enclosure = amount;
    this.lights.forEach((light,i) => {
      const f = this.track.frame(Math.max(0,s+(i ? 11 : -9)),{});
      light.position.set(f.x,f.y+8,f.z); light.color.setHex(COLORS[zone]); light.intensity = amount * 155;
    });
  }
  remove(index) { const root = this.chunks.get(index); if (!root) return; root.removeFromParent(); root.traverse(o => o.geometry?.dispose()); this.chunks.delete(index); }
  dispose() { super.dispose(); for (const i of [...this.chunks.keys()]) this.remove(i); this.materials.forEach(p => Object.values(p).forEach(m => m.dispose())); this.lights.forEach(l => { l.removeFromParent(); l.dispose(); }); this.world.enclosure = 0; }
}
