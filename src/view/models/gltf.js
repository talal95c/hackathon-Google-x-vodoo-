import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Charger un modèle .glb/.gltf (Blender, Mixamo, Sketchfab…) comme modèle du registre.
//
//   import { gltfModel } from './models/gltf.js';
//   Models.register('cactus', gltfModel('/models/cactus.glb', { scale: 1.5 }));
//   Models.register('rexDino', gltfModel('/models/rex.glb', {
//     scale: 0.8, rotationY: Math.PI,
//     clips: { run: 'Run', jump: 'Jump', slide: 'Slide', stumble: 'Hit', fall: 'Fall', idle: 'Idle' },
//   }));
//   // puis dans content/skins.js : view: { model: 'rexDino' }
//
// Les fichiers vont dans /public/models/. Le modèle s'affiche dès qu'il est chargé.
// Si clips est fourni, l'animation suit pose.state (personnages) avec des fondus.
const loader = new GLTFLoader();
const cache = new Map();

export function loadGltf(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

export function gltfModel(url, { scale = 1, rotationY = 0, offsetY = 0, clips = null, timeScale = (p) => Math.max(0.6, p.speed / 26) } = {}) {
  loadGltf(url); // préchargement
  return () => {
    const object = new THREE.Group();
    let mixer = null, actions = {}, current = null;

    loadGltf(url).then((gltf) => {
      const inst = cloneSkinned(gltf.scene);
      inst.scale.setScalar(scale);
      inst.rotation.y = rotationY;
      inst.position.y = offsetY;
      inst.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      object.add(inst);
      if (clips && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(inst);
        for (const [state, name] of Object.entries(clips)) {
          const clip = THREE.AnimationClip.findByName(gltf.animations, name);
          if (clip) actions[state] = mixer.clipAction(clip);
        }
      }
    }).catch((err) => console.error(`[gltf] ${url}`, err));

    return {
      object,
      update(pose, dt) {
        if (!mixer) return;
        const next = actions[pose?.state] || actions.run;
        if (next && next !== current) {
          next.reset().fadeIn(0.15).play();
          current?.fadeOut(0.15);
          current = next;
        }
        if (pose?.speed !== undefined) mixer.timeScale = timeScale(pose);
        mixer.update(dt);
      },
    };
  };
}
