import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { Random } from '../kernel/Random.js';

// Original compositions built from Three.js MIT examples/addons, see
// docs/visual-references.md. Every sculpture stays inside a 10 m ground radius.
const perlin = new ImprovedNoise();
export function sculptureRecipe(salt, chunk, slot, side) {
  const r = new Random(`sculpture-${salt}-${chunk}-${slot}-${side}`);
  return { variant: Math.floor(r.next() * 4), scale: r.range(.78, 1.18), yaw: r.range(-.38, .38), offset: r.range(-5, 5), spacing: r.range(0, 9), seed: Math.floor(r.next()*1e8) };
}

export function createSculpture(theme, variant, seed, materials) {
  const r = new Random(seed), pieces = new Map(), motion = [];
  const add = (key, g, x=0, y=0, z=0) => {
    g.translate(x,y,z);
    if (!pieces.has(key)) pieces.set(key, []);
    pieces.get(key).push(g); return g;
  };
  const box = (key,x,y,z,w,h,d,angle=0) => add(key,new RoundedBoxGeometry(w,h,d,1,Math.min(w,h,d)*.15).rotateY(angle),x,y,z);
  const ball = (key,x,y,z,a,b=a,c=a) => add(key,new THREE.IcosahedronGeometry(1,1).scale(a,b,c),x,y,z);
  const tube = (key,x,y,z,a,h,b=a,n=10) => add(key,new THREE.CylinderGeometry(b,a,h,n),x,y,z);
  const ring = (key,x,y,z,radius,thick=.3,tilt=0) => add(key,new THREE.TorusGeometry(radius,thick,6,32).rotateX(tilt),x,y,z);
  const animate = (geometry,key,x,y,z,spin=.25,bob=.6) => {
    const mesh = new THREE.Mesh(geometry,materials[key]); mesh.position.set(x,y,z);
    mesh.castShadow = !['gold','neon'].includes(key);
    mesh.userData.motion = {spin,bob,phase:r.range(0,Math.PI*2)};
    motion.push(mesh); return mesh;
  };
  const island = () => {
    const geo = new THREE.IcosahedronGeometry(1,1);
    const a=geo.attributes.position;
    for(let i=0;i<a.count;i++) {
      const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
      const bump=1+perlin.noise(x*2+seed%77,y*2,z*2)*.16;
      a.setXYZ(i,x*9*bump,y*2.5-1.7,z*8*bump);
    }
    geo.computeVertexNormals();add('base',geo);
    tube('ground',0,-.55,0,8,.65,8,12);
    if(theme===1||theme===3||theme===4)ring('neon',0,-.12,0,7.85,.11,Math.PI/2);
  };
  island();
  if (theme === 0) {
    if (variant === 0) { // A giant frosted doughnut, with three-dimensional sprinkles.
      ring('accent',0,9,0,5.8,2.05);
      ring('base',0,9,-.8,5.8,1.88);
      for(let i=0;i<26;i++) {
        const a=r.range(0,Math.PI*2), radius=r.range(4.7,6.7);
        add(i%3?'white':'glass',new THREE.CapsuleGeometry(.12,.8,2,4).rotateZ(r.range(0,Math.PI)),Math.cos(a)*radius,9+Math.sin(a)*radius,-2.2);
      }
      for(const x of [-3.5,3.5])tube('white',x,2.3,0,.6,5);
      animate(new THREE.TorusGeometry(7.8,.14,4,36),'neon',0,9,0,.18,.25);
    } else if (variant === 1) { // Stacked ice-cream mountain.
      tube('accent',0,4,0,1.1,9,3.6,8);
      for(let i=0;i<3;i++)ball(['white','base','glass'][i],Math.sin(i*2)*.7,9+i*3.6,0,4.2-i*.6);
      for(let i=0;i<12;i++)ball('gold',r.range(-2,2),17+r.range(-1,1),r.range(-2,2),.2);
      animate(new THREE.IcosahedronGeometry(1,1),'neon',0,21,0,.3,.8);
    } else if (variant === 2) { // Striped lollipops, each with a different height.
      for(let i=0;i<3;i++) {
        const x=(i-1)*5,y=8+r.range(0,5);
        tube('white',x,y/2,0,.35,y);
        for(let k=0;k<4;k++)ring(k%2?'white':'base',x,y,0,.65+k*.65,.38);
        ball('accent',x,y,0,.5);
      }
    } else { // Melted rainbow arch and gumdrop boulders.
      for(let i=0;i<4;i++)add(['base','white','glass','accent'][i],new THREE.TorusGeometry(5.5+i,.48,6,24,Math.PI),0,3,0);
      for(const x of [-7,7])tube('white',x,1,0,1,3);
      for(let i=0;i<5;i++)ball(i%2?'glass':'base',r.range(-6,6),1.5,r.range(-5,5),2,3,2);
    }
  } else if (theme === 1) {
    const mushroom = (x,z,h,radius,key) => {
      tube('white',x,h*.42,z,.7,h*.85,.45,8);
      ball(key,x,h,z,radius,radius*.38,radius);
      ring('neon',x,h-.3,z,radius*.82,.12,Math.PI/2);
      for(let k=0;k<7;k++) {
        const a=k*Math.PI*2/7;
        ball('white',x+Math.cos(a)*radius*.6,h+radius*.29,z+Math.sin(a)*radius*.6,.38,.12,.38);
      }
    };
    if (variant<2) {
      mushroom(0,1,12+variant*5,6,'base');
      mushroom(-5,-3,5,3,'glass'); mushroom(5,-2,7,3.3,'accent');
    } else if(variant===2) { // Blooming lotus: eight luminous, chunky petals.
      tube('dark',0,6,0,.65,12,.35);
      for(let k=0;k<8;k++) {
        const a=k*Math.PI/4;
        add(k%2?'base':'glass',new THREE.IcosahedronGeometry(1,1).scale(1.8,1.4,5).rotateY(a),Math.sin(a)*3,12,Math.cos(a)*3);
      }
      animate(new THREE.OctahedronGeometry(2),'gold',0,14,0,.6,1);
    } else { // Giant crescent moon on a small shrine.
      tube('dark',0,4,0,2,8,1.2,6);
      add('white',new THREE.TorusGeometry(6,1.3,6,28,Math.PI*1.5).rotateZ(-Math.PI*.75),0,13,0);
      animate(new THREE.OctahedronGeometry(1.6),'neon',0,13,0,.35,1.3);
      mushroom(-5,-3,4,2.8,'glass');
    }
    for(let k=0;k<5;k++)ball('neon',r.range(-7,7),r.range(2,6),r.range(-5,5),.18);
  } else if (theme === 2) {
    if(variant===0) { // Memphis diving pool and spiral diving stairs.
      box('white',0,.4,0,14,1.4,12);box('glass',0,1.13,0,12,.1,10);
      for(let k=0;k<8;k++)box(k%2?'base':'white',-5+k*.9,1.6+k*1.1,3,2,1,3);
      box('accent',3,10,1,3,.7,7);
      animate(new THREE.TorusGeometry(2,.5,6,24).rotateX(Math.PI/2),'base',0,2.2,-2,.3,.22);
    } else if(variant===1) {
      for(let k=0;k<3;k++) {
        add(k%2?'white':'base',new THREE.TorusGeometry(5-k*.8,.7,6,24,Math.PI),0,9,k*3-3);
        for(const side of [-1,1])box(k%2?'white':'base',side*(5-k*.8),4.2,k*3-3,1.4,9,1.4);
      }
      animate(new THREE.IcosahedronGeometry(2.2,1),'glass',0,6,0,.35,1);
    } else if(variant===2) { // Oversized parasol, striped folded roof.
      tube('white',0,6,0,.32,12);
      const roof=new THREE.ConeGeometry(8,3,10).toNonIndexed();
      add('base',roof,0,12,0);ring('white',0,10.5,0,8,.16,Math.PI/2);
      for(const x of [-4,4])box('accent',x,1,0,2.2,.7,6,.2*x);
    } else { // Impossible staggered staircase around a polished sphere.
      for(let k=0;k<10;k++)box(k%2?'base':'white',Math.cos(k*.52)*5,1+k*1.2,Math.sin(k*.52)*5,3,1.1,3,k*.52);
      animate(new THREE.IcosahedronGeometry(3,2),'glass',0,10,0,.3,1.5);
      ring('neon',0,10,0,4.5,.15,Math.PI/2);
    }
    // Toy palms frame the water, leaving all leaves inside the footprint.
    for(const side of [-1,1]) {
      tube('accent',side*7,3.5,5,.4,8,.25,6);
      for(let k=0;k<5;k++)add('glass',new THREE.IcosahedronGeometry(1,0).scale(.9,.35,2.7).rotateY(k*1.256),side*7+Math.sin(k*1.256)*1.2,7.5,5+Math.cos(k*1.256)*1.2);
    }
  } else if(theme===3) {
    if(variant===0) {
      tube('dark',0,4,0,8,9,3.3,7);tube('neon',0,8.55,0,3.15,.2,3.15,12);
      for(let k=0;k<5;k++)animate(new THREE.IcosahedronGeometry(.65+k*.15,0),'gold',r.range(-2,2),11+k*2,r.range(-2,2),.4,1.1);
      ring('accent',0,9,0,3.4,.35,Math.PI/2);
    } else if(variant===1) { // Rotating disco ball, concentric dance rings.
      tube('dark',0,4,0,1,9,.65);
      // Equalizer bars frame the disco ball, within the island footprint.
      for(let k=0;k<7;k++) {
        const h=3+(k%4)*2;
        box('dark',(k-3)*1.9,h/2,-5,1.2,h,1.1);
        for(let y=1;y<h;y+=1.2)box(k%2?'neon':'gold',(k-3)*1.9,y,-5.58,.8,.35,.12);
      }
      animate(new THREE.IcosahedronGeometry(4.7,2),'glass',0,13,0,.5,.4);
      for(let i=0;i<3;i++)ring(i%2?'gold':'neon',0,13,0,5.5+i*.7,.15,(i-1)*.7);
    } else if(variant===2) {
      for(let k=0;k<7;k++) {
        const x=r.range(-6,6),z=r.range(-5,5),h=r.range(5,17);
        add(k%2?'glass':'base',new THREE.CylinderGeometry(0,1.7,h,5).rotateZ(r.range(-.22,.22)),x,h/2,z);
        ball('gold',x,h+.5,z,.4);
      }
    } else {
      for(let k=0;k<5;k++) {
        const a=k*.45;
        box(k%2?'glass':'dark',0,1.2+k*3,0,9-k,2.6,7,a);
        ring('neon',0,2.6+k*3,0,5-k*.45,.13,Math.PI/2);
      }
      animate(new THREE.TorusKnotGeometry(2.5,.65,48,6),'gold',0,18,0,.6,.5);
    }
  } else {
    if(variant===0) { // Saturn on a plinth, satellite on an angled orbit.
      ball('base',0,11,0,5.3);
      const orbit=animate(new THREE.TorusGeometry(8,.5,6,40).rotateX(1.05),'accent',0,11,0,.18,.2);
      orbit.rotation.z=.3;
      animate(new THREE.IcosahedronGeometry(1.4,1),'neon',6,16,0,.5,1);
      tube('white',0,3,0,2,6,1);
    } else if(variant===1) {
      for(let k=0;k<3;k++)animate(new THREE.TorusGeometry(5.5+k,.22,6,32).rotateY(k*1.05),k%2?'gold':'neon',0,11,0,.2+k*.1,.3);
      animate(new THREE.IcosahedronGeometry(3,1),'accent',0,11,0,.6,.6);
      tube('base',0,3,0,4,6,2,6);
    } else if(variant===2) { // A kinetic gallery sculpture, a real Three.js torus knot.
      box('white',0,2,0,10,4,10);
      animate(new THREE.TorusKnotGeometry(4.8,1.3,64,8,2,3),'base',0,12,0,.23,1);
      ring('neon',0,2,0,6,.18,Math.PI/2);
    } else {
      for(let k=0;k<5;k++) {
        const geo=new RoundedBoxGeometry(5-k*.35,3,5-k*.35,1,.4);
        animate(geo,k%2?'glass':'white',Math.sin(k*1.8)*2,3+k*4,0,(k%2?1:-1)*.17,.5);
      }
    }
    for(let k=0;k<5;k++)ball(k%2?'glass':'accent',r.range(-7,7),1,r.range(-6,6),1.2);
  }
  return { pieces, motion };
}
