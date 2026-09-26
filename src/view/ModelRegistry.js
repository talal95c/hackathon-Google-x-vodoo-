import * as THREE from 'three';

// Registre des modèles 3D : associe une clé (type d'entité, modèle de skin, décor)
// à une "fabrique" qui construit le visuel.
//
//   Models.register('cactus', (params) => monObjet3D);
//   Models.register('cactus', (params) => ({
//     object: monObjet3D,
//     update(state, dt, time) { ... animation ... },   // optionnel
//     onEvent(type, payload) { ... },                    // optionnel
//     dispose() { ... },                                  // optionnel
//   }));
//
// Pour un fichier .glb : Models.register('cactus', gltfModel('/models/cactus.glb'))
// (voir models/gltf.js). Une clé inconnue affiche un cube magenta au lieu de planter.
class ModelRegistry {
  #factories = new Map();
  #warned = new Set();

  register(key, factory) { this.#factories.set(key, factory); return this; }
  has(key) { return this.#factories.has(key); }

  create(key, params = {}) {
    let factory = this.#factories.get(key);
    if (!factory) {
      if (!this.#warned.has(key)) { console.warn(`[Models] pas de modèle pour "${key}" → cube de remplacement`); this.#warned.add(key); }
      factory = placeholder;
    }
    const res = factory(params);
    return res instanceof THREE.Object3D ? { object: res } : res;
  }
}

export const Models = new ModelRegistry();

function placeholder() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }));
  m.position.y = 1;
  return m;
}

// --- Petits utilitaires partagés par les modèles "cubes"
export const box = new THREE.BoxGeometry(1, 1, 1);
const lamberts = new Map();
export const lambert = (color) => {
  if (!lamberts.has(color)) lamberts.set(color, new THREE.MeshLambertMaterial({ color }));
  return lamberts.get(color);
};
export function cube(parent, mat, sx, sy, sz, x, y, z, shadow = true) {
  const m = new THREE.Mesh(box, typeof mat === 'number' ? lambert(mat) : mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}
