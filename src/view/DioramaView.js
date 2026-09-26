import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { View } from './View.js';
import { ZONES } from '../content/zones.js';
import { isWorldSafe } from '../kernel/WorldJourney.js';
import { tunnelSpan } from './TunnelView.js';

const rand = n => { const a = Math.sin(n*74.7+13.1)*4382.173; return a-Math.floor(a); };
const COLORS = [
  [0xb97553,0xf2d1a3,0x779d62,0xa7bf71,0xedd47c,0x665b48,0xdf8873],
  [0x9d87ae,0xf0dbbe,0x719b8a,0xa8c79b,0xf3c873,0x64517d,0xdf8b9b],
  [0x678caa,0xd5e1d3,0x639c88,0xa8cbb0,0xffd478,0x41647e,0xae9fd5],
  [0x366658,0x8daf91,0x338b75,0x61b88a,0xe1b868,0x294f47,0x718eac],
  [0x8fb8bb,0xedeee1,0x83b9ab,0xb1d3b6,0xffd499,0x63959c,0xd4b5ca],
];

// Human-scale set dressing: planted beds, grass tufts, rounded stones, benches
// and low fences. All static geometry is batched by material, not by prop.
export class DioramaView extends View {
  chunks = new Map();
  constructor(ctx) {
    super(ctx);
    this.palettes = COLORS.map(colors => colors.map(color => new THREE.MeshStandardMaterial({color,roughness:.92,flatShading:true})));
    this.wind = { value: 0 };
    this.palettes.forEach((row,zone) => { if (zone===3) return; for(const key of [2,3]) { row[key].onBeforeCompile = shader => { shader.uniforms.windTime=this.wind; shader.vertexShader='uniform float windTime;\n'+shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(windTime*1.7+position.z*.6+position.x*.3)*.07;'); }; row[key].customProgramCacheKey=()=> 'foliage-wind'; } });
    this.listen('chunk:remove', c => this.remove(c.index));
    this.update(0,0);
  }
  build(chunk) {
    if (ZONES[chunk.zone]?.site) { this.chunks.set(chunk.index,new THREE.Group()); return; }
    const root = new THREE.Group(), buckets = new Map(), tunnel = tunnelSpan(this.track,chunk);
    const put = (key, g, f, x,y,z, angle=0) => {
      g.rotateY(angle).translate(x,y,z).rotateY(f.th).translate(f.x,f.y,f.z);
      if (!buckets.has(key)) buckets.set(key,[]); buckets.get(key).push(g);
    };
    const box = (key,f,x,y,z,w,h,d,angle=0) => put(key,new RoundedBoxGeometry(w,h,d,1,Math.min(w,h,d)*.16),f,x,y,z,angle);
    const rock = (key,f,x,y,z,sx,sy,sz) => put(key,new THREE.IcosahedronGeometry(1,0).scale(sx,sy,sz),f,x,y,z);
    const bush = (f,x,z,n,large=false) => {
      if(chunk.zone===3) {
        put(5,new THREE.CylinderGeometry(.45,.6,large?5:1.4,6),f,x,large?2.1:.5,z);
        if(large)for(let k=0;k<3;k++)put(4,new THREE.TorusGeometry(1.2+k*.3,.14,4,10).rotateX(Math.PI/2),f,x,2+k,z);
        else box(4,f,x,1.3,z,.9,.14,.9);
      } else if(large) {
        put(5,new THREE.CylinderGeometry(.24,.42,4.5,5),f,x,1.8,z);
        for(let i=0;i<5;i++) rock(2+i%2,f,x+Math.sin(i*2.4)*1.35,4.1+rand(n+i)*1.9,z+Math.cos(i*2.4)*1.35,2.25,2.5,2.15);
      } else for(let i=0;i<3;i++)rock(2+i%2,f,x+(i-1)*.7,.25+rand(n+i)*.6,z+Math.sin(i)*.4,.95,.8,.95);
    };
    for(let j=0;j<16;j++) {
      const s=chunk.s0+4+j*7.5;
      if(isWorldSafe(s,80) || (tunnel && s>tunnel.start-8 && s<tunnel.end+8))continue;
      const f=this.track.frame(s,{}), seed=chunk.index*357+j*13;
      for(const side of [-1,1]) {
        const n=seed+(side+1)*67, x=side*(f.w/2+3.8+rand(n)*2.4);
        if(this.track.clearance(f.x+f.lx*x,f.z+f.lz*x,s)<f.w/2+2.6)continue;
        // Small planted islands break up the continuous ground plane.
        box(0,f,x,-.15,0,4.7,.65,5.6,rand(n+1)*.3);
        box(2,f,x,.17,0,4.2,.13,5.1);
        for(let k=0;k<25;k++) {
          const px=x+(rand(n+k*4+2)-.5)*3.9,pz=(rand(n+k*4+3)-.5)*4.8;
          const height=.45+rand(n+k*4+4)*.9;
          // Three tapered blades: a deliberately chunky low-poly silhouette.
          for(let b=0;b<(chunk.zone===3?1:3);b++) {
            const g=(chunk.zone===3?new THREE.BoxGeometry(.12,height,.12):new THREE.ConeGeometry(.14,height,3)).translate(0,height/2,0);g.rotateZ((b-1)*.24);
            put(chunk.zone===3?4:2+(k%3===0?1:0),g,f,px,.24,pz,b*2.1);
          }
          if(k%8===0)rock(4,f,px,height+.35,pz,.18,.16,.18);
        }
        const variant=(j+chunk.index+(side>0?1:0))%5;
        if(variant===0) bush(f,x+side*1.1,1,n,true);
        else if(variant===1) {
          // A little wooden bench and two stones facing the road.
          for(const dz of [-1,1])box(5,f,x,-.0,dz,2.4,.6,.25);
          for(let k=0;k<3;k++)box(1,f,x+(k-1)*.48,.52,0,.4,.2,3);
          for(let k=0;k<2;k++)box(1,f,x+side*.86,1.2+k*.35,0,.22,.26,3);
        } else if(variant===2) {
          box(6,f,x,.5,0,2.25,1.5,2.25);
          box(1,f,x,1.22,0,2.4,.25,2.4);bush(f,x,0,n);
        } else if(variant===3) {
          for(let k=0;k<3;k++)rock(k%2?1:6,f,x+(k-1)*.8,.45+k*.12,Math.sin(k*2),.9,.7+k*.1,.8);
          bush(f,x+side*1.8,-1,n);
        } else {
          for(let k=0;k<3;k++)box(5,f,x+side*1.5,.7,(k-1)*1.5,.26,1.9,.26);
          for(let k=0;k<2;k++)box(1,f,x+side*1.5,.6+k*.65,0,.22,.25,3.6);
        }
        // Paving and scattered pebbles make the road belong to the scenery.
        for(let k=0;k<3;k++) {
          box(1,f,side*(f.w/2+1.2),-.22,(k-1)*2,1.3,.25,1.65);
          rock(1,f,x-side*2.5,.0,(k-1)*2,.3+rand(n+k)*.3,.22,.35);
        }
      }
    }
    for(const [key,pieces] of buckets) {
      const normalized=pieces.map(g=>g.index?g.toNonIndexed():g),mesh=new THREE.Mesh(mergeGeometries(normalized),this.palettes[chunk.zone][key]);
      new Set([...pieces,...normalized]).forEach(g=>g.dispose());mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    }
    this.scene.add(root);this.chunks.set(chunk.index,root);
  }
  update(dt=0,time=0) { this.wind.value=time; for(const c of this.track.chunks)if(!this.chunks.has(c.index)&&c.s0<this.game.runner.z+265)this.build(c); }
  remove(index) { const root=this.chunks.get(index);if(!root)return;root.removeFromParent();root.traverse(o=>o.geometry?.dispose());this.chunks.delete(index); }
  dispose() { super.dispose();for(const i of [...this.chunks.keys()])this.remove(i);this.palettes.flat().forEach(m=>m.dispose()); }
}
