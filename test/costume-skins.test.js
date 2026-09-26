import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../src/content/index.js';
import '../src/view/models/costumeDinos.js';
import { Skins } from '../src/kernel/Registry.js';
import { Models } from '../src/view/ModelRegistry.js';
import { Profile } from '../src/meta/Profile.js';
import { Shop } from '../src/meta/Shop.js';
import { MemoryStorage } from '../src/meta/Storage.js';

const costumes=['vader','drift','mario','alligator'];
test('les quatre costumes sont inclus sans remplacer la progression existante',()=>{
 const storage=new MemoryStorage();storage.save('dino-escape-profile',{coins:347,skin:'neon',skins:['classic','neon'],best:9876,runs:9,music:{reggae:3},theme:'techno',upgrades:{'upgrade:magnet':1}});
 const profile=new Profile(storage),shop=new Shop(profile);
 assert.equal(profile.coins,347);assert.equal(profile.data.skin,'neon');assert.equal(profile.data.best,9876);assert.equal(profile.data.music.reggae,3);
 for(const id of costumes){assert.ok(profile.ownsSkin(id));profile.selectSkin(id);assert.equal(shop.prepareRun().skin,id);assert.equal(profile.coins,347);assert.equal(Skins.get(id).modifiers,undefined);}
 const restored=new Profile(storage);assert.equal(restored.data.skin,'alligator');
 for(const id of costumes)assert.equal(restored.data.skins.filter(s=>s===id).length,1);
});

for(const id of costumes)test(`${id} : modèle animé fini, ressources propres à chaque joueur`,()=>{
 const view=Skins.get(id).view;assert.ok(Models.has(view.model));
 const model=Models.create(view.model,view),other=Models.create(view.model,view);
 const geometry=new Set(),material=new Set();model.object.traverse(o=>{if(o.geometry)geometry.add(o.geometry);if(o.material)material.add(o.material);});
 other.object.traverse(o=>{assert.equal(geometry.has(o.geometry),false);assert.equal(material.has(o.material),false);});
 for(const state of ['idle','run','jump','slide','stumble','fall']){
  model.onEvent('runner:land',{impact:.8});
  for(let frame=0;frame<12;frame++)model.update({state,speed:40,gait:frame*.35,steer:-.6,grounded:state!=='jump'&&state!=='fall',vy:5,boost:state==='run'},1/60,frame/60);
  const bounds=new THREE.Box3().setFromObject(model.object),size=bounds.getSize(new THREE.Vector3());
  assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
  assert.ok(size.y>2&&size.y<7&&size.x<6&&size.z<8,`${id} reste à l'échelle du dino`);
 }
 let disposed=0;for(const resource of [...geometry,...material])resource.addEventListener('dispose',()=>disposed++);
 model.dispose();assert.equal(disposed,geometry.size+material.size);
 other.update({state:'run',speed:30,gait:1,steer:0,grounded:true,vy:0,boost:false},1/60,1);other.dispose();
});
