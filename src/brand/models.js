import * as THREE from 'three';
import '../view/models/entities.js';
import '../view/models/decor.js';
import { Models, cube, lambert } from '../view/ModelRegistry.js';
import { View } from '../view/View.js';
import { isWorldSafe } from '../kernel/WorldJourney.js';

// Brand visuals. Registered after the base models so they replace them by key;
// hitboxes and gameplay stay those of the main game.

const UP = new THREE.Vector3(0, 1, 0);

// Geometries and materials are shared by every instance of a model, so despawned entities leave nothing to dispose.
const shared = new Map();
const once = (key, make) => { if (!shared.has(key)) shared.set(key, make()); return shared.get(key); };
const boxGeo = (w, h, d) => once(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylGeo = (r, h) => once(`cyl:${r}:${h}`, () => new THREE.CylinderGeometry(r, r, h, 20));

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const paint = (img) => { g.clearRect(0, 0, w, h); draw(g, w, h, img); t.needsUpdate = true; };
  return { texture: t, paint };
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fitImage(g, img, x, y, maxW, maxH) {
  const s = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * s, h = img.height * s;
  g.drawImage(img, x + (maxW - w) / 2, y + (maxH - h) / 2, w, h);
}

function brandTextures(pack) {
  const p = pack.palette ?? {};
  const primary = p.primary ?? '#143852', accent = p.accent ?? '#ffcc40', alt = p.alt ?? '#cf2e2e', light = p.light ?? '#ffffff';
  const logoPromise = loadImage(pack.logo);
  const make = (w, h, draw) => {
    const t = canvasTexture(w, h, draw);
    t.paint(null);
    logoPromise.then((img) => img && t.paint(img));
    return t.texture;
  };
  const boxSide = make(256, 256, (g, w, h, img) => {
    g.fillStyle = primary; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, h - 34, w, 34);
    if (img) fitImage(g, img, 24, 40, w - 48, h - 110);
    else { g.fillStyle = light; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.fillText(pack.name.slice(0, 6).toUpperCase(), w / 2, 140); }
  });
  const coin = make(128, 128, (g, w, h, img) => {
    g.fillStyle = accent; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = primary; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fill();
    if (img) fitImage(g, img, 18, 30, 92, 68);
  });
  const ads = (pack.ads?.length ? pack.ads : [{ text: pack.name, sub: pack.tagline ?? '' }]).map((ad, i) => make(512, 320, (g, w, h, img) => {
    const bg = i % 2 ? light : primary, fg = i % 2 ? primary : light;
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
    if (img) {
      if (i % 2) { g.fillStyle = primary; g.fillRect(20, 30, w - 40, 110); }
      fitImage(g, img, 40, 36, w - 80, 98);
    }
    g.textAlign = 'center'; g.fillStyle = fg;
    g.font = 'bold 54px sans-serif'; g.fillText(ad.text ?? '', w / 2, img ? 205 : 150, w - 40);
    g.fillStyle = i % 2 ? alt : accent; g.font = 'bold 30px sans-serif'; g.fillText(ad.sub ?? '', w / 2, img ? 255 : 210, w - 40);
    g.fillStyle = fg; g.font = '22px sans-serif'; g.fillText((pack.url ?? '').replace(/^https?:\/\/|\/$/g, ''), w / 2, h - 30);
  }));
  return { primary, accent, alt, light, boxSide, coin, ads };
}

// Burger kit: takeaway boxes, fries, burgers. `generic` = logo crates/tokens for any business.
const KITS = {
  burger(T) {
    const box = (g, w, h, d, x, y, z) => {
      const mats = once('burger:boxMats', () => { const side = new THREE.MeshLambertMaterial({ map: T.boxSide }), top = lambert(T.primary); return [side, side, top, top, side, side]; });
      const m = new THREE.Mesh(boxGeo(w, h, d), mats);
      m.position.set(x, y, z); m.castShadow = true; g.add(m);
      cube(g, T.accent, w + 0.04, 0.12, d + 0.04, x, y + h / 2 - 0.25, z);
      return m;
    };
    const burger = (g, r, y) => {
      const layer = (color, h, rr, yy) => { const m = new THREE.Mesh(cylGeo(rr, h), lambert(color)); m.position.y = yy; m.castShadow = true; g.add(m); };
      layer(0xd08a3c, r * 0.35, r, y - r * 0.35);
      layer(0x5a2e1a, r * 0.28, r * 1.05, y - r * 0.05);
      layer(0xffc43d, r * 0.1, r * 1.12, y + r * 0.12);
      layer(0x4caf50, r * 0.08, r * 1.08, y + r * 0.2);
      const top = new THREE.Mesh(once(`bun:${r}`, () => new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), lambert(0xe09a45));
      top.position.y = y + r * 0.24; top.scale.y = 0.7; top.castShadow = true; g.add(top);
    };
    return {
      cactus: () => { const g = new THREE.Group(); box(g, 2.0, 1.6, 1.0, 0, 0.8, 0); box(g, 1.4, 0.5, 0.8, 0, 1.85, 0); return g; },
      cactusBig: () => {
        const g = new THREE.Group();
        for (let i = -1; i <= 1; i++) {
          const h = i === 0 ? 2.4 : 1.6;
          cube(g, T.alt, 0.9, h * 0.7, 0.8, i * 1.2, h * 0.35, 0);
          for (let k = 0; k < 4; k++) cube(g, 0xffd54f, 0.14, h * 0.45, 0.14, i * 1.2 - 0.3 + k * 0.2, h * 0.7 + 0.1, 0, false);
        }
        return g;
      },
      tabWall: () => { const g = new THREE.Group(); for (let i = -2; i <= 2; i++) box(g, 0.95, 1.2, 0.8, i, 0.6, 0); return g; },
      cookieBanner: () => {
        const g = new THREE.Group();
        const mats = once('burger:bannerMats', () => { const face = new THREE.MeshBasicMaterial({ map: T.ads[0] }); return [lambert(T.primary), lambert(T.primary), lambert(T.accent), lambert(T.accent), face, face]; });
        const m = new THREE.Mesh(boxGeo(6.5, 1.3, 0.3), mats);
        m.position.y = 0.9; g.add(m);
        return g;
      },
      rollingCookie: () => {
        const g = new THREE.Group(), wheel = new THREE.Group();
        wheel.position.y = 1.6; g.add(wheel);
        const side = new THREE.Group(); side.rotation.z = Math.PI / 2; wheel.add(side);
        burger(side, 1.5, 0);
        return { object: g, update(e, dt, t) { wheel.rotation.x = -t * 8; } };
      },
      coin: () => {
        const g = new THREE.Group(); burger(g, 0.7, 1.2);
        return { object: g, update(e, dt, t) { g.rotation.y = t * 3 + e.id; } };
      },
      goldCoin: () => {
        const g = new THREE.Group(), s = new THREE.Group(); g.add(s); burger(s, 0.9, 1.2);
        s.traverse((o) => { if (o.material) o.material = once(`gold:${o.material.color.getHex()}`, () => new THREE.MeshLambertMaterial({ color: o.material.color, emissive: 0x945700, emissiveIntensity: 0.5 })); });
        return { object: g, update(e, dt, t) { g.rotation.y = t * 3 + e.id; } };
      },
    };
  },
  generic(T) {
    const crate = (w, h, d) => () => {
      const g = new THREE.Group(); const side = once('generic:side', () => new THREE.MeshLambertMaterial({ map: T.boxSide }));
      const m = new THREE.Mesh(boxGeo(w, h, d), side); m.position.y = h / 2; m.castShadow = true; g.add(m);
      return g;
    };
    const token = (scale) => () => {
      const geo = once(`token:${scale}`, () => new THREE.CylinderGeometry(0.9 * scale, 0.9 * scale, 0.18, 20).rotateX(Math.PI / 2));
      const m = new THREE.Mesh(geo, once('generic:coin', () => new THREE.MeshBasicMaterial({ map: T.coin })));
      m.position.y = 1.2;
      return { object: m, update(e, dt, t) { m.rotation.y = t * 3 + e.id; } };
    };
    return { cactus: crate(2, 2, 1), cactusBig: crate(3.4, 2.4, 1), tabWall: crate(5, 1.25, 0.8), coin: token(1), goldCoin: token(1.2) };
  },
};

export function registerBrandModels(pack) {
  const T = brandTextures(pack);
  const kit = (KITS[pack.kit] ?? KITS.generic)(T);
  for (const [key, factory] of Object.entries(kit)) Models.register(key, factory);
  return T;
}

// Roadside billboards carrying the brand's ads, streamed per track chunk.
export function billboardView(T) {
  return class BrandBillboards extends View {
    chunks = new Map();
    constructor(ctx) {
      super(ctx);
      this.post = lambert(T.primary);
      this.frameMat = lambert(T.accent);
      this.faces = T.ads.map((map) => new THREE.MeshBasicMaterial({ map }));
      this.listen('chunk:remove', (c) => this.remove(c.index));
    }
    build(chunk) {
      const root = new THREE.Group(), t = this.track;
      for (let j = 0; j < 2; j++) {
        const s = chunk.s0 + 18 + j * 60;
        if (isWorldSafe(s)) continue;
        const f = t.frame(s, {}), side = (chunk.index + j) % 2 ? 1 : -1, x = side * (f.w / 2 + 10);
        if (t.clearance(f.x + f.lx * x, f.z + f.lz * x, s) < f.w / 2 + 6) continue;
        const face = this.faces[(chunk.index * 2 + j) % this.faces.length];
        const g = new THREE.Group();
        cube(g, this.post, 0.5, 6, 0.5, -3, 3, 0, false);
        cube(g, this.post, 0.5, 6, 0.5, 3, 3, 0, false);
        const board = new THREE.Mesh(boxGeo(8.4, 5.25, 0.3), [this.frameMat, this.frameMat, this.frameMat, this.frameMat, face, face]);
        board.position.y = 8; g.add(board);
        g.position.set(x, 0, 0).applyAxisAngle(UP, f.th).add(new THREE.Vector3(f.x, f.y, f.z));
        g.rotation.y = f.th - side * 0.45;
        root.add(g);
      }
      this.scene.add(root);
      this.chunks.set(chunk.index, root);
    }
    remove(index) {
      const root = this.chunks.get(index);
      if (!root) return;
      root.removeFromParent();
      this.chunks.delete(index);
    }
    update() {
      for (const c of this.track.chunks) if (!this.chunks.has(c.index) && c.s0 < this.game.runner.z + 280) this.build(c);
    }
    dispose() { super.dispose(); for (const i of [...this.chunks.keys()]) this.remove(i); }
  };
}
