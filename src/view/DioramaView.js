import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { View } from './View.js';
import { ZONES } from '../content/zones.js';
import { Random } from '../kernel/Random.js';
import { isWorldSafe } from '../kernel/WorldJourney.js';
import { tunnelSpan } from './TunnelView.js';

// Seeded MeshSurfaceSampler + InstancedMesh, as in Three.js' scatter example.
// Hundreds of small flowers / candy / crystals cost four draw calls per chunk.
export class DioramaView extends View {
  chunks = new Map();
  constructor(ctx) {
    super(ctx);
    this.palettes=ZONES.map(z=>[z.scenery[0],z.scenery[4],z.scenery[1],z.scenery[6]].map(color=>new THREE.MeshStandardMaterial({color,roughness:.78,flatShading:true})));
    this.listen('chunk:remove', c => this.remove(c.index));
    this.update(0,0);
  }
  build(chunk) {
    const root=new THREE.Group(), rng=new Random(`garden-${this.track.salt}-${chunk.index}`), tunnel=tunnelSpan(this.track,chunk);
    const matrices=[[],[],[]], soil=[], dummy=new THREE.Object3D(), local=new THREE.Vector3(), normal=new THREE.Vector3();
    const geo=new THREE.IcosahedronGeometry(1,1).scale(2.1,.5,2.7);
    const sampleMesh=new THREE.Mesh(geo,this.palettes[chunk.zone][0]);
    const sampler=new MeshSurfaceSampler(sampleMesh).setRandomGenerator(()=>rng.next()).build();
    for(let j=0;j<13;j++)for(const side of [-1,1]) {
      const s=chunk.s0+5+j*9+rng.range(-2,2);
      if(isWorldSafe(s)||(tunnel&&s>tunnel.start-8&&s<tunnel.end+8))continue;
      const f=this.track.frame(s,{}),x=side*(f.w/2+5+rng.range(0,2));
      if(this.track.clearance(f.x+f.lx*x,f.z+f.lz*x,s)<f.w/2+4)continue;
      soil.push(geo.clone().translate(x,-.5,0).rotateY(f.th).translate(f.x,f.y,f.z));
      for(let k=0;k<18;k++) {
        sampler.sample(local,normal); if(normal.y<.25)continue;
        const height=rng.range(.4,1.8), type=k%3;
        dummy.position.copy(local).add(new THREE.Vector3(x,0,0)).applyAxisAngle(UP,f.th).add(new THREE.Vector3(f.x,f.y,f.z));
        dummy.position.y+=height*.35;
        dummy.rotation.set(0,rng.range(0,6.28),rng.range(-.2,.2));
        dummy.scale.set(.45,height,.45);dummy.updateMatrix();
        matrices[type].push(dummy.matrix.clone());
      }
    }
    geo.dispose();
    if(soil.length) {
      const normalized=soil.map(g=>g.index?g.toNonIndexed():g);
      const mesh=new THREE.Mesh(mergeGeometries(normalized),this.palettes[chunk.zone][0]);
      new Set([...soil,...normalized]).forEach(g=>g.dispose());mesh.receiveShadow=true;root.add(mesh);
    }
    matrices.forEach((list,i)=>{
      if(!list.length)return;
      let geometry;
      if(chunk.zone===1) geometry=i===0?new THREE.ConeGeometry(1.2,.7,7):new THREE.IcosahedronGeometry(.7,0);
      else if(chunk.zone===3||chunk.zone===4)geometry=new THREE.OctahedronGeometry(.8,0);
      else geometry=i===0?new THREE.ConeGeometry(.75,1.2,5):new THREE.IcosahedronGeometry(.75,1);
      const mesh=new THREE.InstancedMesh(geometry,this.palettes[chunk.zone][i+1],list.length);
      list.forEach((matrix,k)=>mesh.setMatrixAt(k,matrix));mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    });
    this.scene.add(root);this.chunks.set(chunk.index,root);
  }
  update() { for(const c of this.track.chunks)if(!this.chunks.has(c.index)&&c.s0<this.game.runner.z+265)this.build(c); }
  remove(index) { const root=this.chunks.get(index);if(!root)return;root.removeFromParent();root.traverse(o=>{o.geometry?.dispose();if(o.isInstancedMesh)o.dispose();});this.chunks.delete(index); }
  dispose() { super.dispose();for(const i of [...this.chunks.keys()])this.remove(i);this.palettes.flat().forEach(m=>m.dispose()); }
}
const UP=new THREE.Vector3(0,1,0);
