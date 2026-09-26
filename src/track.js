import * as THREE from 'three';
import { ZONES, zoneForS } from "./themes.js";
import * as TX from './textures.js';


const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Ressources partagées (créées une seule fois)
const box = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
const lambert = (color) => {
  if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color }));
  return mats.get(color);
};
let T = null;
function tex() {
  if (T) return T;
  T = {
    popup: new THREE.MeshLambertMaterial({ map: TX.popupTex() }),
    cookie: new THREE.MeshLambertMaterial({ map: TX.cookieTex() }),
    tabs: ['Nouvel onglet', 'Sans titre', 'Chargement…', '404'].map(
      (l) => new THREE.MeshLambertMaterial({ map: TX.tabTex(l) })),
    loading: new THREE.MeshBasicMaterial({ map: TX.loadingTex() }),
    ads: [0, 50, 120, 200, 280, 330].map((h, i) => new THREE.MeshBasicMaterial({ map: TX.adTex(h + i) })),
    favicon: new THREE.MeshBasicMaterial({ map: TX.faviconTex(), transparent: true }),
    chevL: new THREE.MeshBasicMaterial({ map: TX.chevronTex(true) }),
    chevR: new THREE.MeshBasicMaterial({ map: TX.chevronTex(false) }),
  };
  return T;
}
const coinGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.18, 20).rotateX(Math.PI / 2);
const cookieGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.6, 18).rotateX(Math.PI / 2);

function mesh(geo, mat, sx, sy, sz, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// ---- Obstacles : renvoient { obj, hx, hz } en coordonnées locales du segment
// (axe "along" = z local, "lat" = x local). hx/hz = demi-taille du collider.
const OBSTACLES = {
  cactus(g) {
    const c = lambert(0x535353);
    mesh(box, c, 0.9, 2.1, 0.9, 0, 1.05, 0, g);
    mesh(box, c, 0.6, 1.0, 0.6, -0.9, 1.3, 0, g);
    mesh(box, c, 0.6, 0.45, 0.6, -0.6, 1.0, 0, g);
    mesh(box, c, 0.6, 0.9, 0.6, 0.9, 1.5, 0, g);
    mesh(box, c, 0.6, 0.45, 0.6, 0.6, 1.2, 0, g);
    return { hx: 1.1, hz: 0.5, h: 2.1 };
  },
  cactusBig(g) {
    const c = lambert(0x535353);
    for (let i = -1; i <= 1; i++) { const hh = i === 0 ? 2.4 : 1.6; mesh(box, c, 0.8, hh, 0.8, i * 1.2, hh / 2, 0, g); }
    return { hx: 1.9, hz: 0.5, h: 2.4 };
  },
  popup(g) {
    const t = tex();
    const m = mesh(box, [lambert(0xdddddd), lambert(0xdddddd), lambert(0xdddddd), lambert(0xdddddd), t.popup, t.popup], 4, 2.5, 0.3, 0, 1.6, 0, g);
    m.userData.bob = Math.random() * 6;
    return { hx: 2, hz: 0.4, h: 99 }; // pop-up flottant : trop haut, il faut l'esquiver
  },
  tabWall(g) {
    const t = tex();
    const mat = pick(t.tabs);
    mesh(box, [lambert(0xeeeeee), lambert(0xeeeeee), lambert(0xeeeeee), lambert(0xeeeeee), mat, mat], 5, 1.25, 0.4, 0, 0.8, 0, g);
    return { hx: 2.5, hz: 0.4, h: 1.45 };
  },
  cookieBanner(g) {
    const t = tex();
    mesh(box, [lambert(0xfffbe8), lambert(0xfffbe8), lambert(0xfffbe8), lambert(0xfffbe8), t.cookie, t.cookie], 6.5, 1.3, 0.3, 0, 0.9, 0, g);
    return { hx: 3.25, hz: 0.4, h: 1.55 };
  },
  cookie(g) {
    const m = mesh(cookieGeo, lambert(0xc68642), 1, 1, 1, 0, 1.6, 0, g);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mesh(box, lambert(0x3e2723), 0.35, 0.35, 0.2, Math.cos(a) * 0.9, 1.6 + Math.sin(a) * 0.9, 0.32, g);
    }
    m.userData.spin = true;
    return { hx: 1.6, hz: 0.4, h: 99 };
  },
};

// ---- Décor hors piste
const DECOR = {
  clouds(g, zone) {
    const c = lambert(0xcfcfcf);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const x = rand(-3, 3), y = rand(0, 1.4);
      mesh(box, c, rand(3, 5), 0.8, 1.2, x, y, 0, g);
      mesh(box, c, rand(1.5, 2.5), 0.8, 1.2, x + rand(-1, 1), y + 0.8, 0, g);
    }
    g.scale.setScalar(rand(1, 2));
  },
  windows(g) {
    const t = tex();
    const w = rand(8, 16), h = rand(6, 12);
    mesh(box, lambert(0xffffff), w, h, 0.5, 0, 0, 0, g);
    mesh(box, lambert(0x1a73e8), w, 1, 0.6, 0, h / 2 - 0.5, 0, g);
    mesh(box, pick(t.tabs), Math.min(6, w * 0.4), 1.2, 0.6, -w / 4, h / 2 + 0.6, 0, g);
  },
  ads(g) {
    const t = tex();
    const s = rand(5, 11);
    mesh(box, pick(t.ads), s, s, 0.4, 0, 0, 0, g);
  },
};

// ---------------------------------------------------------------------------
// Route continue façon Horizon Drive : virages doux + dénivelé.
// La route est une polyligne échantillonnée tous les STEP mètres. Tout le gameplay
// se fait en coordonnées "piste" : s (distance le long de la route) et d (décalage
// latéral, + = gauche). frame(s) convertit vers le monde.
export const STEP = 2;
export const CHUNK_SAMPLES = 60;             // un morceau de maillage = 120 m
const CHUNK_LEN = STEP * CHUNK_SAMPLES;

const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.chunks = [];
  }

  reset() {
    for (const c of this.chunks) this.scene.remove(c.group);
    this.chunks = [];
    this.nextChunk = 0;
    // échantillons
    this.X = [0]; this.Y = [0]; this.Z = [0]; this.TH = [0]; this.K = [0]; this.SL = [0]; this.W = [12];
    this.gen = { th: 0, k: 0, kT: 0, kLeft: 60, slope: 0, slT: 0, slLeft: 80 };
    this.ensure(700);
    while (this.nextChunk * CHUNK_LEN < 500) this.buildChunk();
  }

  // --- Génération des échantillons
  ensure(s) {
    const need = Math.ceil(s / STEP) + 2;
    const g = this.gen;
    while (this.X.length < need) {
      const i = this.X.length;
      const dist = i * STEP;
      const warm = dist < 110; // départ droit et plat
      const diff = Math.min(1, dist / 4000);

      // Courbure : on planifie des arcs (angle + rayon) séparés de lignes droites.
      // Le cap reste dans ±1.35 rad → la route avance toujours, elle ne se recoupe jamais.
      g.kLeft -= STEP;
      if (g.kLeft <= 0) {
        if (g.inArc || Math.random() < 0.35) {
          g.inArc = false; g.kT = 0; g.kLeft = rand(0, 40) * (1 - diff * 0.5); // ligne droite (parfois nulle → S)
        } else {
          const rMin = 30 - diff * 16;                       // 30 m → 14 m (épingles)
          const R = Math.random() < 0.3 ? rMin : rand(rMin, 70);
          let sign = Math.random() < 0.5 ? -1 : 1;
          if (Math.abs(g.th) > 0.5) sign = -Math.sign(g.th);  // on revient vers l'axe
          const room = 1.35 - sign * g.th;                   // angle max sans dépasser ±1.35
          const angle = Math.min(room, rand(0.4, 1.6));
          g.inArc = true; g.kT = sign / R; g.kLeft = Math.max(8, angle * R);
        }
      }
      g.k += ((warm ? 0 : g.kT) - g.k) * 0.25;
      if (Math.abs(g.th) > 1.4 && Math.sign(g.k) === Math.sign(g.th)) g.k = 0; // garde-fou

      // Pente : collines, bosses, descentes
      g.slLeft -= STEP;
      if (g.slLeft <= 0) {
        const sMax = 0.1 + diff * 0.12;
        g.slT = Math.random() < 0.25 ? 0 : rand(-1, 1) * sMax;
        const y = this.Y[i - 1];
        if (y > 35) g.slT = -Math.abs(g.slT); else if (y < -35) g.slT = Math.abs(g.slT);
        g.slLeft = rand(30, 100);
      }
      g.slope += ((warm ? 0 : g.slT) - g.slope) * 0.05;

      g.th += g.k * STEP;
      this.TH.push(g.th); this.K.push(g.k); this.SL.push(g.slope);
      this.X.push(this.X[i - 1] + Math.sin(g.th) * STEP);
      this.Z.push(this.Z[i - 1] + Math.cos(g.th) * STEP);
      this.Y.push(this.Y[i - 1] + g.slope * STEP);
      // plus étroit avec la distance, plus large dans les virages serrés
      this.W.push(Math.max(9, 12 - dist / 900) + Math.min(4, Math.abs(g.k) * 90));
    }
  }

  // Repère interpolé à la distance s
  frame(s, out = {}) {
    this.ensure(s + STEP);
    const f = Math.max(0, s) / STEP;
    const i = Math.floor(f), t = f - i;
    const L = (A) => A[i] + (A[i + 1] - A[i]) * t;
    out.x = L(this.X); out.y = L(this.Y); out.z = L(this.Z);
    out.th = L(this.TH); out.k = L(this.K); out.slope = L(this.SL); out.w = L(this.W);
    out.lx = Math.cos(out.th); out.lz = -Math.sin(out.th); // vecteur "gauche"
    return out;
  }

  // Point monde pour (s, d, hauteur au-dessus de la route)
  world(s, d, h = 0, out = new THREE.Vector3()) {
    const f = this.frame(s, this._f || (this._f = {}));
    return out.set(f.x + f.lx * d, f.y + h, f.z + f.lz * d);
  }

  // Pose un objet sur la route, orienté selon la route (cap + pente)
  placeObj(obj, s, d, h = 0) {
    const f = this.frame(s, {});
    obj.position.set(f.x + f.lx * d, f.y + h, f.z + f.lz * d);
    obj.rotation.order = 'YXZ';
    obj.rotation.y = f.th;
    obj.rotation.x = -Math.atan(f.slope);
  }

  // --- Maillage d'un morceau de route
  buildChunk() {
    const c = this.nextChunk++;
    const i0 = c * CHUNK_SAMPLES, i1 = i0 + CHUNK_SAMPLES;
    const s0 = i0 * STEP;
    this.ensure(i1 * STEP + STEP);
    const zoneIdx = zoneForS(s0);
    const zone = ZONES[zoneIdx];
    const group = new THREE.Group();

    const top = [], walls = [], edges = [], dashes = [];
    const pt = (i, d, dy = 0) => {
      const th = this.TH[i];
      return [this.X[i] + Math.cos(th) * d, this.Y[i] + dy, this.Z[i] - Math.sin(th) * d];
    };
    const quad = (arr, a, b, c2, d2) => arr.push(...a, ...b, ...c2, ...b, ...d2, ...c2);
    for (let i = i0; i < i1; i++) {
      const w0 = this.W[i] / 2, w1 = this.W[i + 1] / 2;
      quad(top, pt(i, w0), pt(i, -w0), pt(i + 1, w1), pt(i + 1, -w1));
      quad(walls, pt(i, w0), pt(i, w0, -1.8), pt(i + 1, w1), pt(i + 1, w1, -1.8));
      quad(walls, pt(i, -w0), pt(i, -w0, -1.8), pt(i + 1, -w1), pt(i + 1, -w1, -1.8));
      quad(walls, pt(i, w0, -1.8), pt(i, -w0, -1.8), pt(i + 1, w1, -1.8), pt(i + 1, -w1, -1.8));
      for (const side of [1, -1]) {
        quad(edges, pt(i, side * w0, 0.03), pt(i, side * (w0 - 0.45), 0.03), pt(i + 1, side * w1, 0.03), pt(i + 1, side * (w1 - 0.45), 0.03));
      }
      if (i % 4 < 2) quad(dashes, pt(i, 0.15, 0.03), pt(i, -0.15, 0.03), pt(i + 1, 0.15, 0.03), pt(i + 1, -0.15, 0.03));
    }
    const geoOf = (arr) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      return g;
    };
    const roadMat = new THREE.MeshLambertMaterial({ color: zone.road, side: THREE.DoubleSide });
    const road = new THREE.Mesh(geoOf(top), roadMat);
    road.receiveShadow = true;
    const wallMesh = new THREE.Mesh(geoOf(walls), new THREE.MeshLambertMaterial({ color: new THREE.Color(zone.road).multiplyScalar(0.72), side: THREE.DoubleSide }));
    const edgeMesh = new THREE.Mesh(geoOf(edges), new THREE.MeshBasicMaterial({ color: zone.edge, side: THREE.DoubleSide }));
    const dashMesh = new THREE.Mesh(geoOf(dashes), zoneIdx === 0 ? lambert(0xbdbdbd) : dashMat);
    dashMesh.material.side = THREE.DoubleSide;
    group.add(road, wallMesh, edgeMesh, dashMesh);

    const chunk = { c, s0, s1: i1 * STEP, zoneIdx, group, obstacles: [], coins: [], pads: [], anim: [] };
    if (c > 0) this.populate(chunk, zone);
    this.decorate(chunk, zone);
    this.scene.add(group);
    this.chunks.push(chunk);
  }

  populate(chunk, zone) {
    const diff = Math.min(1, chunk.s0 / 4000);
    const gap = 30 - diff * 12;
    let s = chunk.s0 + rand(4, 14);
    while (s < chunk.s1 - 4) {
      const f = this.frame(s, {});
      const W = f.w;
      const roll = Math.random();
      if (roll < 0.6) {
        const kind = pick(zone.obstacles);
        const g = new THREE.Group();
        const { hx, hz, h } = OBSTACLES[kind](g);
        const maxD = Math.max(0, W / 2 - hx - 0.3);
        const d = rand(-maxD, maxD);
        this.placeObj(g, s, d);
        g.traverse((o) => { if (o.userData.bob !== undefined || o.userData.spin) chunk.anim.push(o); });
        chunk.group.add(g);
        chunk.obstacles.push({ obj: g, s, d, hx, hz, h });
      } else if (roll < 0.85) {
        const d = rand(-W / 2 + 1.5, W / 2 - 1.5);
        for (let k = 0; k < 5; k++) {
          const c = new THREE.Mesh(coinGeo, tex().favicon);
          const g = new THREE.Group(); g.add(c);
          c.position.y = 1.2;
          const cs = s + k * 2.6;
          this.placeObj(g, cs, d);
          chunk.group.add(g);
          chunk.coins.push({ obj: g, coin: c, s: cs, d });
        }
        s += 10;
      } else {
        const m = new THREE.Mesh(box, tex().loading);
        m.scale.set(3, 0.06, 5); m.position.y = 0.05;
        const g = new THREE.Group(); g.add(m);
        const d = rand(-W / 2 + 2, W / 2 - 2);
        this.placeObj(g, s, d);
        chunk.group.add(g);
        chunk.pads.push({ obj: g, s, d, hx: 1.5, hz: 2.5 });
      }
      s += gap * rand(0.7, 1.3);
    }
  }

  // Distance mini entre un point monde et la route autour de s (pour ne pas poser de décor dessus)
  clearance(x, z, s) {
    let best = Infinity;
    const i0 = Math.max(0, Math.floor((s - 260) / STEP)), i1 = Math.min(this.X.length - 1, Math.floor((s + 260) / STEP));
    for (let i = i0; i <= i1; i += 3) best = Math.min(best, Math.hypot(this.X[i] - x, this.Z[i] - z));
    return best;
  }

  decorate(chunk, zone) {
    const n = Math.ceil(CHUNK_LEN / 20);
    for (let k = 0; k < n; k++) {
      const s = rand(chunk.s0, chunk.s1);
      const f = this.frame(s, {});
      const side = Math.random() < 0.5 ? -1 : 1;
      const d = side * rand(f.w / 2 + 14, f.w / 2 + 50);
      const x = f.x + f.lx * d, z = f.z + f.lz * d;
      if (this.clearance(x, z, s) < f.w / 2 + 12) continue;
      const g = new THREE.Group();
      DECOR[zone.decor](g, zone);
      g.position.set(x, f.y + rand(-8, 14), z);
      g.rotation.y = f.th + rand(-0.4, 0.4);
      g.traverse((o) => { o.castShadow = false; });
      chunk.group.add(g);
    }
  }

  // Morceaux proches de s (pour les collisions)
  near(s) { return this.chunks.filter((c) => s >= c.s0 - 10 && s <= c.s1 + 10); }

  update(s, time) {
    while (this.nextChunk * CHUNK_LEN < s + 520) this.buildChunk();
    while (this.chunks.length && this.chunks[0].s1 < s - 160) this.scene.remove(this.chunks.shift().group);
    for (const c of this.chunks) {
      if (c.s1 < s - 20 || c.s0 > s + 200) continue;
      for (const a of c.anim) {
        if (a.userData.spin) a.rotation.z = time * 2;
        else a.position.y = 1.6 + Math.sin(time * 2 + a.userData.bob) * 0.3;
      }
      for (const co of c.coins) co.coin.rotation.y = time * 3;
    }
    if (T) T.loading.map.offset.x = -time * 1.5;
  }
}
