import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isWorldSafe } from '../kernel/WorldJourney.js';
import { tunnelSpan } from './TunnelView.js';
import { ZONES } from '../content/zones.js';

const UP=new THREE.Vector3(0,1,0);
const palettes=[
  [0xe8759c,0xffe9bd,0xa26ac4,0x6de0ce],
  [0x527c6b,0xdfe9b9,0x342e54,0x93ffd3],
  [0x58a8b7,0xd9d6bd,0xd46e85,0xffbb75],
  [0x483451,0x94dce4,0x272133,0xff57b5],
  [0x677b9d,0x83cdda,0x272b49,0x61dcff],
];

// Architectural cross-sections surround the real flat playable deck. All
// geometry that rises above it remains outside the lanes or above jump height.
export function buildRoadArchitecture(track,chunk) {
  const root=new THREE.Group(),buckets=new Map(),theme=chunk.zone;
  const colors=palettes[theme],span=tunnelSpan(track,chunk);
  const night=ZONES[theme].palette.night;
  const materials=colors.map((color,i)=>{
    const settings={color,emissive:i===3?color:0,emissiveIntensity:i===3?(night?3.1:1.7):0,side:THREE.DoubleSide,flatShading:true};
    return theme===2?new THREE.MeshLambertMaterial(settings):new THREE.MeshStandardMaterial({...settings,roughness:.86,envMapIntensity:.15});
  });
  root.userData.materials=materials;
  const put=(key,g)=>{if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);};
  const point=(s,x,y)=>{const f=track.frame(s,{});return new THREE.Vector3(f.x+f.lx*x,f.y+y,f.z+f.lz*x);};
  const local=(s,x,y,z=0)=>{const f=track.frame(s,{});return new THREE.Vector3(x,y,z).applyAxisAngle(UP,f.th).add(new THREE.Vector3(f.x,f.y,f.z));};
  const rod=(key,a,b,r=.18)=>{
    const v=b.clone().sub(a),g=new THREE.CylinderGeometry(r,r,v.length(),6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,v.normalize()));
    g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());put(key,g);
  };
  const box=(key,s,x,y,w,h,d,roll=0)=>{const f=track.frame(s,{});put(key,new THREE.BoxGeometry(w,h,d).rotateZ(roll).translate(x,y,0).rotateY(f.th).translate(f.x,f.y,f.z));};
  const clear=s=>!isWorldSafe(s)&&!(span&&s>span.start-12&&s<span.end+12);
  const quad=(key,points)=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));
    g.computeVertexNormals();g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(points.length*2),2));put(key,g);
  };
  for(let s=chunk.s0;s<chunk.s1;s+=2) {
    if(!clear(s+1))continue;
    const f=track.frame(s,{}),n=track.frame(s+2,{}),w=f.w/2,nw=n.w/2;
    for(const side of [-1,1]) {
      if(theme===2) { // Actual skate-bowl side profile, with ceramic ribs.
        const shape=[[.6,-.15],[1.25,.1],[2,.55],[2.7,1.35],[3.2,2.6],[3.45,4.1]];
        for(let k=0;k<shape.length-1;k++) {
          const [a,y]=shape[k],[b,by]=shape[k+1];
          const A=point(s,side*(w+a),y),B=point(s,side*(w+b),by),C=point(s+2,side*(nw+a),y),D=point(s+2,side*(nw+b),by);
          quad(Math.floor(s/4)%2?0:1,[A,B,C,B,D,C]);
        }
        rod(2,point(s,side*(w+3.45),4.15),point(s+2,side*(nw+3.45),4.15),.23);
      } else {
        // Winding frosting / roots / luminous rails, rather than motorway lines.
        const wave=theme===0?Math.sin(s*.21)*.2:0;
        rod(theme===0?(Math.floor(s/4)%2?0:1):theme===1?0:3,
          point(s,side*(w+.7),.45+wave),point(s+2,side*(nw+.7),.45+wave),theme===0?.52:theme===1?.38:.16);
        if(night)rod(3,point(s,side*(w+.52),.13),point(s+2,side*(nw+.52),.13),.09);
        if(theme===4)rod(2,point(s,side*(w+.9),-.65),point(s+2,side*(nw+.9),-.65),.5);
        if(theme===1) { // Each leaf vein joins the edge of the living boardwalk.
          if(Math.floor(s)%10===0)rod(1,point(s,side*(w+.65),-.1),point(s+6,side*(nw+2.6),-.4),.12);
        }
      }
      // Layered wafer / leaf / piano / magnetic deck edge; never enters lanes.
      if(theme!==2) {
        const y=theme===0?-2.3:theme===1?-1.0:-1.9;
        rod(theme===0?1:theme===1?1:0,point(s,side*(w-.1),y),point(s+2,side*(nw-.1),y),theme===0?.25:.12);
      }
    }
    if(theme===4) { // Helical magnetic rails actually wind around the whole deck.
      const phi=s*.045,phin=(s+2)*.045;
      for(let k=0;k<2;k++) {
        const a=phi+k*Math.PI,b=phin+k*Math.PI;
        const A=point(s,Math.cos(a)*(w+5.5),3+Math.sin(a)*(w+5.5));
        const B=point(s+2,Math.cos(b)*(nw+5.5),3+Math.sin(b)*(nw+5.5));
        rod(k?3:0,A,B,k?.22:.44);
      }
    }
  }
  for(let s=Math.ceil(chunk.s0/12)*12;s<chunk.s1;s+=12) {
    if(!clear(s)||isWorldSafe(s+10)||track.hardTurnAt(s,12))continue;
    const f=track.frame(s,{}),w=f.w/2,style=track.profiles?.section(s).style??'ribbon';
    // Tall structures are omitted near hairpins or another part of the route.
    const outsideFree=side=>track.clearance(f.x+f.lx*side*(w+5),f.z+f.lz*side*(w+5),s)>w+3.7;
    if(theme===0) {
      // Frosting drips and alternating wafer supports reveal a layered ribbon.
      for(const side of [-1,1]) {
        const g=new THREE.IcosahedronGeometry(1,1).scale(.6,1.1+.8*Math.sin(s),.8);
        put(0,g.translate(side*(w+.25),-1.6,0).rotateY(f.th).translate(f.x,f.y,f.z));
        if(style==='viaduct')box(1,s,side*(w-1.1),-6.2,.8,9,1.3);
      }
    } else if(theme===1) {
      // Giant folded leaves grow off the branch on both sides.
      for(const side of [-1,1])if(outsideFree(side)) {
        const tip=local(s,side*(w+5),2.5,3),stem=local(s,side*(w+1),-.3,-3);
        const front=local(s,side*(w+2.4),.35,5),back=local(s,side*(w+2.4),.35,-5);
        quad(0,[stem,front,tip,stem,tip,back]);rod(3,stem,tip,.09);
      }
    } else if(theme===2) {
      // Diving boards and ladders belong to the outside of the bowl.
      for(const side of [-1,1])if(outsideFree(side)&&Math.floor(s/12)%3===0) {
        for(let j=0;j<4;j++)box(1,s,side*(w+3.8),.6+j*.85,.6,.14,.9);
        box(2,s,side*(w+4.4),4.4,1.8,.3,3.5);
      }
    } else if(theme===3) {
      for(const side of [-1,1]) {
        // Piano bridge has hanging resonator pipes above the lava ravine.
        rod(0,point(s,side*(w-.8),-2),point(s,side*(w-.8),-8-(Math.floor(s/12)%4)),.5);
        rod(3,point(s,side*(w-.8),-7),point(s+5,side*(w-.8),-7),.13);
      }
    } else if(Math.floor(s/12)%3===0) {
      // Structural hoops emphasize the loops without steering the dino upside down.
      const points=[];
      for(let i=0;i<=32;i++){const a=i*Math.PI*2/32;points.push(local(s,Math.cos(a)*(w+5.5),3+Math.sin(a)*(w+5.5)));}
      for(let i=0;i<points.length-1;i++)rod(1,points[i],points[i+1],.2);
    }
  }
  // Scenic gate at irregular intervals: a different silhouette per universe.
  const gateEvery=(track.profiles?.section(chunk.s0).cadence??14)*6,gateOffset=gateEvery/2;
  for(let s=Math.ceil((chunk.s0-gateOffset)/gateEvery)*gateEvery+gateOffset;s<chunk.s1;s+=gateEvery) {
    if(s<chunk.s0||!clear(s)||!clear(s+18)||track.hardTurnAt(s,25))continue;
    const f=track.frame(s,{}),w=f.w/2;
    if(theme===4)continue;
    if(theme===0||theme===1) {
      const points=[];
      for(let k=0;k<=18;k++) {
        const a=k*Math.PI/18;
        points.push(local(s,Math.cos(a)*(w+4),2+Math.sin(a)*15));
      }
      for(let k=0;k<18;k++)rod(theme===0?(k%2?1:0):(k%3===0?3:0),points[k],points[k+1],theme===0?.65:.42);
      if(theme===1)for(let k=3;k<16;k+=3) {
        const leaf=new THREE.IcosahedronGeometry(1,0).scale(1.5,.4,3).rotateY(k);
        put(k%2?1:3,leaf.translate(...points[k].toArray()));
      }
    } else if(theme===2) {
      for(const side of [-1,1])box(1,s,side*(w+5),6,.75,14,.75);
      rod(2,local(s,-w-5,13),local(s,w+5,13),.35);
      for(let k=0;k<9;k++) {
        const x=(k-4)*(w+4)/4;
        quad(k%2?0:2,[local(s,x-.8,12.7),local(s,x+.8,12.7),local(s,x,10.8)]);
      }
    } else {
      // An equalizer arch: high headroom, neon columns on the sides.
      for(const side of [-1,1])for(let k=0;k<3;k++)box(k%2?0:3,s,side*(w+2.4+k*.9),5+k*2,.5,10+k*4,.8);
      rod(3,local(s,-w-4,14),local(s,w+4,14),.25);
    }
  }
  for(const [key,geos] of buckets) {
    const gs=geos.map(g=>g.index?g.toNonIndexed():g),merged=mergeGeometries(gs);
    new Set([...geos,...gs]).forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(merged,materials[key]);mesh.castShadow=key!==3;mesh.receiveShadow=key!==3;
    root.add(mesh);
  }
  root.userData.routeArchitecture=true;
  return root;
}

export function disposeRoadArchitecture(root) {
  root.traverse(o=>o.geometry?.dispose());
  root.userData.materials?.forEach(m=>m.dispose());
}
