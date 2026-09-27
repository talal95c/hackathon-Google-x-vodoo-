import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { View } from './View.js';
import { ZONES } from '../content/zones.js';
import { isWorldSafe } from '../kernel/WorldJourney.js';
import { tunnelSpan } from './TunnelView.js';

const COLORS = ZONES.map(z => [z.scenery[6], z.scenery[5]]);
const UP = new THREE.Vector3(0,1,0);

// The lights belong to the miniature scenery: frosted lanterns, short guide
// strips and soft pools on the ground. Music changes their glow, not exposure.
export class SideLightShow extends View {
  chunks = new Map();
  constructor(ctx) {
    super(ctx);
    this.dark = new THREE.MeshStandardMaterial({color:0x475353,roughness:.85});
    this.cap = new THREE.MeshStandardMaterial({color:0xb39276,roughness:.72});
    this.palette = COLORS.map(row=>row.map(color=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.4,roughness:.55})));
    this.poolGeo = new THREE.PlaneGeometry(8,8).rotateX(-Math.PI/2);
    this.pools = COLORS.map(row=>row.map(color=>new THREE.ShaderMaterial({
      uniforms:{tint:{value:new THREE.Color(color)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 tint;varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=pow(max(0.,1.-r),2.)*.25;gl_FragColor=vec4(tint*1.2,a);}',
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    })));
    this.lights = [-1,1].map(()=>{const l=new THREE.PointLight(0xffc17b,0,23,2);this.scene.add(l);return l;});
    this.listen('chunk:remove',c=>this.remove(c.index));this.update(0,0);
  }
  build(chunk) {
    if (ZONES[chunk.zone]?.site) { this.chunks.set(chunk.index,new THREE.Group()); return; }
    const root=new THREE.Group(),groups=new Map(),span=tunnelSpan(this.track,chunk);
    const add=(key,g,f,x,y,z)=>{g.translate(x,y,z).rotateY(f.th).translate(f.x,f.y,f.z);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(g);};
    const box=(key,f,x,y,z,w,h,d)=>add(key,new RoundedBoxGeometry(w,h,d,1,Math.min(w,h,d)*.15),f,x,y,z);
    for(let j=0;j<5;j++) {
      const s=chunk.s0+10+j*24;
      if(isWorldSafe(s)||chunk.zone===2||(span&&s>span.start-6&&s<span.end+6))continue;
      const f=this.track.frame(s,{});
      for(const side of [-1,1]) {
        const col=side<0?0:1,x=side*(f.w/2+1.6);
        if(this.track.clearance(f.x+f.lx*x,f.z+f.lz*x,s)<f.w/2+1.9)continue;
        // Small sculptural edge lights replace street lanterns. Architecture
        // now provides the tall silhouettes; these simply mark the safe deck.
        box('dark',f,x,-.25,0,.8,.6,.8);
        add(col,new THREE.OctahedronGeometry(.48,0),f,x,.5,0);
        const pool=new THREE.Mesh(this.poolGeo,this.pools[chunk.zone][col]);
        pool.position.set(x,-.37,0).applyAxisAngle(UP,f.th).add(new THREE.Vector3(f.x,f.y,f.z));pool.rotation.y=f.th;root.add(pool);
        for(let k=0;k<3;k++)box(col,f,side*(f.w/2+.25),.03,k*3-3,.1,.1,1.1);
      }
    }
    for(const[key,geos]of groups){const normalized=geos.map(g=>g.index?g.toNonIndexed():g);const mesh=new THREE.Mesh(mergeGeometries(normalized),key==='dark'?this.dark:key==='cap'?this.cap:this.palette[chunk.zone][key]);new Set([...geos,...normalized]).forEach(g=>g.dispose());mesh.castShadow=typeof key==='string';mesh.receiveShadow=true;root.add(mesh);}
    this.scene.add(root);this.chunks.set(chunk.index,root);
  }
  remove(index){const root=this.chunks.get(index);if(!root)return;root.removeFromParent();root.traverse(o=>{if(o.geometry&&o.geometry!==this.poolGeo)o.geometry.dispose();});this.chunks.delete(index);}
  update(dt,time){
    for(const c of this.track.chunks)if(!this.chunks.has(c.index)&&c.s0<this.game.runner.z+280)this.build(c);
    const pulse=this.ctx.fx?.pulse??0;
    this.palette.forEach(row=>row.forEach((m,i)=>{m.emissiveIntensity=2.2+pulse*.65+Math.sin(time*2-i)*.12;}));
    const f=this.track.frame(this.game.runner.z,{}),colors=COLORS[this.game.zoneIndex];
    this.lights.forEach((l,i)=>{const side=i?1:-1;l.color.setHex(colors[i]);l.position.set(f.x+f.lx*side*(f.w/2+2),f.y+3.5,f.z+f.lz*side*(f.w/2+2));l.intensity=(this.game.zone.palette.softLight?0:this.game.zone.palette.sunset?40+pulse*6:24+pulse*8)*(1-(this.world.enclosure??0));});
  }
  dispose(){super.dispose();for(const i of [...this.chunks.keys()])this.remove(i);this.poolGeo.dispose();this.dark.dispose();this.cap.dispose();[this.palette,this.pools].forEach(rows=>rows.flat().forEach(m=>m.dispose()));this.lights.forEach(l=>{l.removeFromParent();l.dispose();});}
}
