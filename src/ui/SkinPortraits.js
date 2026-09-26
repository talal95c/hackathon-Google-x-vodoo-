import * as THREE from 'three';
import { Skins } from '../kernel/Registry.js';
import { Models } from '../view/ModelRegistry.js';

let portraits;

// One temporary renderer, shared by the entire collection. The menu subsequently
// displays cached images, so eight cards do not run eight animation loops.
export function skinPortraits() {
  if (portraits) return portraits;
  portraits = new Map();
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, preserveDrawingBuffer:true });
  renderer.setSize(320,300); renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xd4e5ff,0xa69072,2.0));
  const key = new THREE.DirectionalLight(0xffe4c5,3.0);
  key.position.set(-3,7,5); key.castShadow=true;key.shadow.mapSize.set(512,512);
  Object.assign(key.shadow.camera,{left:-4,right:4,top:6,bottom:-3,near:1,far:20});
  key.shadow.normalBias=.04;scene.add(key);
  const rim=new THREE.DirectionalLight(0xb1d7ff,2);rim.position.set(4,4,-4);scene.add(rim);
  const baseGeo=new THREE.CylinderGeometry(2.6,2.75,.18,32);
  const baseMat=new THREE.MeshStandardMaterial({color:0xe4ddd0,roughness:.9});
  const base=new THREE.Mesh(baseGeo,baseMat);base.position.y=-.13;base.receiveShadow=true;scene.add(base);
  const camera=new THREE.PerspectiveCamera(34,320/300,.1,40);
  camera.position.set(5.8,4.5,8.7);camera.lookAt(0,2.05,-.10);
  try {
    for(const skin of Skins.all()) {
      const model=Models.create(skin.view.model,skin.view);
      scene.add(model.object);
      try {
        model.update?.({state:'idle',speed:0,gait:0,steer:0,grounded:true,vy:0,boost:false,driftCharge:0},0,0);
        renderer.render(scene,camera);
        portraits.set(skin.id,renderer.domElement.toDataURL('image/png'));
      } finally { model.object.removeFromParent();model.dispose?.(); }
    }
  } finally {
    baseGeo.dispose();baseMat.dispose();key.shadow.dispose();renderer.dispose();renderer.forceContextLoss();
  }
  return portraits;
}
