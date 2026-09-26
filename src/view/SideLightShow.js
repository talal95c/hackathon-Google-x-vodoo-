import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { View } from './View.js';
import { isWorldSafe } from '../kernel/WorldJourney.js';

const COLORS = [[0x00aaff,0xff603e,0xffb020],[0x28baff,0xf780b0,0xffcd62],[0x35bfff,0x8d83ff,0xffca62],[0x28efae,0x67b8ff,0xffbb57],[0x32d1e1,0xfba7ca,0xb1a1ff]];
const UP = new THREE.Vector3(0,1,0);

// Light installations sit alongside the track. No full-screen flashes: local
// beams, travelling LEDs and rotating data sculptures carry the musical energy.
export class SideLightShow extends View {
  chunks=new Map();
  constructor(ctx){
    super(ctx);
    this.dark=new THREE.MeshStandardMaterial({color:0x23313d,metalness:.4,roughness:.4});
    this.palette=COLORS.map(colors=>colors.map(color=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.3,roughness:.3,metalness:.12})));
    this.beamGeo=new THREE.CylinderGeometry(4.6,.16,17,12,1,true).translate(0,8.5,0);
    this.beams=COLORS.map(colors=>colors.map(color=>new THREE.ShaderMaterial({
      uniforms:{tint:{value:new THREE.Color(color)},pulse:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 tint;uniform float pulse;varying vec2 vUv;void main(){float a=pow(1.-vUv.y,2.)*(.19+pulse*.065);gl_FragColor=vec4(tint*1.8,a);}',
      transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    })));
    this.poolGeo=new THREE.PlaneGeometry(11,11).rotateX(-Math.PI/2);
    this.pools=COLORS.map(colors=>colors.map(color=>new THREE.ShaderMaterial({
      uniforms:{tint:{value:new THREE.Color(color)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform vec3 tint;varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=pow(max(0.,1.-r),2.)*.34;gl_FragColor=vec4(tint*1.7,a);}',
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    })));
    this.lightA=new THREE.PointLight(0x35c9ff,65,30,2);
    this.lightB=new THREE.PointLight(0xff9e71,55,30,2);
    this.scene.add(this.lightA,this.lightB);
    this.listen('chunk:remove',c=>this.remove(c.index));
    this.update(0,0);
  }
  build(chunk){
    const root=new THREE.Group(), beams=[],sculptures=[],groups=new Map(),t=this.track;
    const add=(key,geo,f,x,y,z)=>{geo.translate(x,y,z).rotateY(f.th).translate(f.x,f.y,f.z);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(geo);};
    const box=(key,f,x,y,z,w,h,d)=>add(key,new THREE.BoxGeometry(w,h,d),f,x,y,z);
    const place=(object,f,x,y,z)=>{object.position.set(x,y,z).applyAxisAngle(UP,f.th).add(new THREE.Vector3(f.x,f.y,f.z));object.rotation.y=f.th;root.add(object);};
    for(let j=0;j<5;j++){
      const s=chunk.s0+6+j*24;if(isWorldSafe(s))continue;const f=t.frame(s,{});
      for(const side of [-1,1]){
        const col=(j+chunk.index+(side>0?1:0))%3,x=side*(f.w/2+5.5);
        if(t.clearance(f.x+f.lx*x,f.z+f.lz*x,s)<f.w/2+3.8)continue;
        box('dark',f,x,-2.3,0,2.2,2.8,2.2);
        box(col,f,x,-.8,0,2.45,.18,2.45);
        box('dark',f,x,1,0,.65,3.5,.65);
        box(col,f,x-side*.36,1,0,.13,3.4,.38);
        // Three staggered light strips read as data moving past the runner.
        for(let k=0;k<3;k++)box(col,f,side*(f.w/2+.35+k*.27),-.5-k*.25,0,.12,.10,12-k*2);
        if(j%2===0){
          const beam=new THREE.Mesh(this.beamGeo,this.beams[chunk.zone][col]);
          place(beam,f,x,2.8,0);beams.push({beam,side,phase:j+chunk.index*1.2,th:f.th});
          const pool=new THREE.Mesh(this.poolGeo,this.pools[chunk.zone][col]);place(pool,f,x,-3.72,0);
          add(col,new THREE.TorusGeometry(1.4,.12,4,16).rotateX(Math.PI/2),f,x,-.66,0);
        }
        if(j%3===1){
          // Four angular orbit pieces, a faceted data core and a pedestal.
          const sculpture=new THREE.Group(),material=this.palette[chunk.zone][col];
          const core=new THREE.Mesh(new THREE.OctahedronGeometry(1.3),material);sculpture.add(core);
          for(let k=0;k<3;k++){
            const ring=new THREE.Mesh(new THREE.TorusGeometry(2.6,.1,4,6,Math.PI*1.5),material);
            ring.rotation.set(k*.85,k*1.1,k*.65);sculpture.add(ring);
          }
          place(sculpture,f,x+side*3,5.2,0);sculptures.push({sculpture,y:sculpture.position.y,phase:j+side});
        }
      }
    }
    for(const [key,geos]of groups){const g=mergeGeometries(geos);geos.forEach(x=>x.dispose());const mesh=new THREE.Mesh(g,key==='dark'?this.dark:this.palette[chunk.zone][key]);mesh.castShadow=key==='dark';root.add(mesh);}
    root.userData={beams,sculptures};this.scene.add(root);this.chunks.set(chunk.index,root);
  }
  remove(index){const root=this.chunks.get(index);if(!root)return;root.removeFromParent();root.traverse(o=>{if(o.geometry&&o.geometry!==this.beamGeo&&o.geometry!==this.poolGeo)o.geometry.dispose();});this.chunks.delete(index);}
  update(dt,time){
    for(const c of this.track.chunks)if(!this.chunks.has(c.index)&&c.s0<this.game.runner.z+280)this.build(c);
    const pulse=this.ctx.fx?.pulse??0,down=this.ctx.fx?.down??0;
    this.palette.forEach(row=>row.forEach((m,i)=>{m.emissiveIntensity=1.8+pulse*.85+Math.sin(time*3-i*1.8)*.25;}));
    this.beams.forEach(row=>row.forEach(m=>{m.uniforms.pulse.value=pulse;}));
    for(const root of this.chunks.values()){
      for(const {beam,side,phase,th}of root.userData.beams)beam.rotation.set(.13*Math.sin(time*.6+phase),th,-side*(.22+.14*Math.sin(time*.85+phase)));
      for(const {sculpture,y,phase}of root.userData.sculptures){sculpture.rotation.y+=dt*.6;sculpture.rotation.z=Math.sin(time*.7+phase)*.12;sculpture.position.y=y+Math.sin(time*1.1+phase)*.45;sculpture.scale.setScalar(1+down*.1);}
    }
    const f=this.track.frame(this.game.runner.z,{}),colors=COLORS[this.game.zoneIndex];
    this.lightA.color.setHex(colors[0]);this.lightB.color.setHex(colors[1]);
    this.lightA.position.set(f.x+f.lx*7,f.y+3,f.z+f.lz*7);
    this.lightB.position.set(f.x-f.lx*7,f.y+3,f.z-f.lz*7);
    this.lightA.intensity=18+pulse*10;this.lightB.intensity=16+down*12;
  }
  dispose(){super.dispose();for(const i of [...this.chunks.keys()])this.remove(i);this.beamGeo.dispose();this.poolGeo.dispose();this.dark.dispose();[this.palette,this.beams,this.pools].forEach(rows=>rows.flat().forEach(m=>m.dispose()));this.lightA.removeFromParent();this.lightB.removeFromParent();}
}
