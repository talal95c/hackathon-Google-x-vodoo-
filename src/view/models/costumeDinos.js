import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Models } from '../ModelRegistry.js';

const PALETTES = {
  vader: { skin: 0x343d4c, light: 0x586274, belly: 0x232936, suit: 0x151b27, shoes: 0x1a2332 },
  drift: { skin: 0xeee5d8, light: 0xfff1df, belly: 0xcaa18b, suit: 0x292b3e, shoes: 0xea5397 },
  mario: { skin: 0x61b882, light: 0x9ad797, belly: 0xe6daaa, suit: 0x2865c6, shoes: 0x79503c },
  alligator: { skin: 0x4d9167, light: 0x8ebd72, belly: 0xe3d29a, suit: 0x4d9167, shoes: 0x649a61 },
};

// Four locally modelled costumes share the same articulated dino skeleton.
// Each instance owns its resources, including the animated cape geometry.
Models.register('costumeDino', ({ costume = 'alligator' } = {}) => {
  const style = PALETTES[costume] ? costume : 'alligator', palette = PALETTES[style];
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const geometries = new Set(), materials = new Set();
  const own = g => { geometries.add(g); return g; };
  const material = (color, options = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .78, flatShading: true, ...options });
    materials.add(m); return m;
  };
  const skin = material(palette.skin), light = material(palette.light), belly = material(palette.belly);
  const suit = material(palette.suit), shoes = material(palette.shoes);
  const ink = material(0x192332), white = material(0xfff2dc), gold = material(0xf3bf52);
  const red = material(0xde3e44), pink = material(0xf259ab), blue = material(0x2865c6);
  const metal = material(0x9aaabd, { roughness: .32, metalness: .65 });
  const helmet = material(0x202938, { roughness: .3, metalness: .35 });
  const glow = material(style === 'vader' ? 0xff334c : 0xcb73ff, {
    emissive: style === 'vader' ? 0xff142d : 0xb858ff, emissiveIntensity: style === 'vader' ? 3.0 : 1.8,
  });
  const round = own(new RoundedBoxGeometry(1,1,1,1,.15));
  const facet = own(new THREE.IcosahedronGeometry(1,1));
  const gem = own(new THREE.IcosahedronGeometry(1,0));
  const cylinder = own(new THREE.CylinderGeometry(1,1,1,12));
  const spike = own(new THREE.ConeGeometry(1,1,4));
  const part = (parent, geo, mat, scale, pos) => {
    const mesh = new THREE.Mesh(geo,mat); mesh.scale.set(...scale); mesh.position.set(...pos);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const box = (parent, mat, scale, pos) => part(parent,round,mat,scale,pos);
  const ball = (parent, mat, scale, pos) => part(parent,facet,mat,scale,pos);
  const cone = (parent, mat, scale, pos) => part(parent,spike,mat,scale,pos);

  ball(body,style === 'alligator' ? skin : suit,[.87,1.02,1.01],[0,1.88,-.02]);
  ball(body,style==='alligator'?belly:suit,[.67,.79,.22],[0,1.86,.82]);
  ball(body,skin,[.52,.58,.52],[0,2.67,.51]);
  const head = new THREE.Group(); head.position.set(0,3.13,.74); body.add(head);
  ball(head,skin,[.86,.71,.87],[0,.01,.10]);
  box(head,style==='vader'?helmet:light,[1.48,.63,style === 'alligator' ? 1.98 : 1.20],[0,-.18,style === 'alligator' ? .95 : .74]);
  box(head,belly,[1.25,.20,style === 'alligator' ? 1.81 : 1.06],[0,style === 'alligator' ? -.72 : -.53,style === 'alligator' ? .99 : .75]);
  for(const side of [-1,1]) {
    if(style==='vader'||style==='drift')continue;
    const eyeZ=style==='alligator'?.33:.64;
    ball(head,light,[.29,.31,.29],[side*.56,.31,eyeZ]);
    box(head,white,[.30,.30,.15],[side*.56,.36,eyeZ+.23]);
    box(head,ink,[.13,.23,.06],[side*.56,.36,eyeZ+.32]);
    ball(head,ink,[.06,.035,.07],[side*.42,.15,style==='alligator'?1.85:1.22]);
  }
  const arms = [-1,1].map(side => {
    const arm=new THREE.Group();arm.position.set(side*.75,2.22,.44);body.add(arm);
    ball(arm,style==='mario'?red:style==='alligator'?skin:suit,[.26,.39,.29],[side*.07,-.23,.10]);
    ball(arm,style==='mario'?white:style==='vader'?helmet:light,[.27,.23,.28],[side*.09,-.49,.26]);
    if(style==='drift')box(arm,gold,[.44,.13,.45],[side*.09,-.39,.24]);
    return arm;
  });
  const legs = [-1,1].map(side => {
    const leg=new THREE.Group();leg.position.set(side*.46,1.18,-.06);body.add(leg);
    ball(leg,style==='alligator'?skin:suit,[.37,.53,.42],[0,-.22,0]);
    box(leg,shoes,[.63,.41,style==='alligator'?1.13:.94],[0,-.78,.24]);
    box(leg,style==='vader'?helmet:belly,[.65,.13,style==='alligator'?1.16:.97],[0,-1,.25]);
    if(style==='drift')box(leg,gold,[.49,.10,.55],[0,-.51,.26]);
    if(style==='alligator')for(let k=0;k<3;k++)cone(leg,white,[.085,.22,.08],[(k-1)*.2,-.77,.83]).rotation.x=Math.PI/2;
    return leg;
  });
  const tail=new THREE.Group();tail.position.set(0,1.91,-.83);body.add(tail);
  for(let i=0;i<3;i++)ball(tail,i%2?light:skin,[.47-i*.14,.43-i*.12,.80-i*.10],[0,.01+i*.055,-.52-i*.70]);
  for(let i=0;i<5;i++)cone(tail,style==='alligator'?skin:style==='mario'?red:style==='drift'?pink:helmet,[.19-i*.02,.34-i*.035,.23],[0,.37-i*.04,-.16-i*.41]);

  let cape=null, capeRest=null, hat=null, prop=null;
  if(style==='vader') {
    // Flared helmet, brow, triangular respirator and chest controls.
    ball(head,helmet,[1.02,.83,.95],[0,.35,.05]);
    part(head,own(new THREE.CylinderGeometry(.80,1.16,.70,12)),helmet,[1,1,.87],[0,.05,.04]);
    box(head,helmet,[1.63,.35,.30],[0,.29,.93]);
    for(const side of [-1,1]) {
      box(head,ink,[.58,.25,.13],[side*.38,.08,1.11]).rotation.z=-side*.15;
      box(head,metal,[.45,.045,.025],[side*.40,.25,1.11]).rotation.z=-side*.14;
      box(head,helmet,[.35,.57,.50],[side*.61,-.27,.92]).rotation.z=side*.25;
    }
    const mask=new THREE.Shape();mask.moveTo(-.38,-.28);mask.lineTo(0,.28);mask.lineTo(.38,-.28);mask.closePath();
    const maskGeo=own(new THREE.ExtrudeGeometry(mask,{depth:.14,bevelEnabled:false}));
    part(head,maskGeo,ink,[1,1,1],[0,-.24,1.36]);
    for(let k=-1;k<=1;k++)box(head,metal,[.045,.19-Math.abs(k)*.04,.028],[k*.15,-.30,1.53]);
    box(body,helmet,[1.52,.32,.68],[0,2.55,.36]);
    box(body,ink,[.85,.75,.20],[0,2.07,.96]);
    for(let k=0;k<3;k++)box(body,k===0?red:k===1?blue:white,[.14,.14,.04],[(k-1)*.22,2.27,1.08]);
    for(let k=0;k<3;k++)box(body,metal,[.48,.055,.04],[0,2.03-k*.12,1.08]);
    box(body,helmet,[1.58,.21,1.60],[0,1.35,0]);box(body,metal,[.35,.24,.13],[0,1.35,.84]);
    const capeGeo=own(new THREE.PlaneGeometry(1,1,10,10)),pos=capeGeo.attributes.position;
    for(let i=0;i<pos.count;i++) {
      const u=pos.getX(i)*2,v=.5-pos.getY(i);
      pos.setXYZ(i,u*(.70+v*.59),2.70-v*2.43,-.69-v*.89+u*u*.20);
    }
    capeGeo.computeVertexNormals();capeRest=new Float32Array(pos.array);
    cape=new THREE.Mesh(capeGeo,material(0x18202e,{side:THREE.DoubleSide,roughness:.96}));cape.castShadow=true;body.add(cape);
    const saber=new THREE.Group();saber.position.set(.1,-.43,.40);saber.rotation.z=-.3;arms[1].add(saber);
    part(saber,cylinder,metal,[.13,.52,.13],[0,.12,0]);
    for(let k=0;k<3;k++)part(saber,cylinder,ink,[.14,.055,.14],[0,k*.13,0]);
    part(saber,cylinder,glow,[.083,2.18,.083],[0,1.50,0]);ball(saber,glow,[.083,.083,.083],[0,2.59,0]);
    part(saber,cylinder,material(0xffd9da,{emissive:0xffc5cf,emissiveIntensity:2.5}),[.035,2.15,.035],[0,1.50,.071]);
    prop=saber;
  } else if(style==='mario') {
    // Cap, raised M badge, moustache, gloves and blue overalls.
    hat=new THREE.Group();hat.position.set(0,.56,.02);head.add(hat);
    ball(hat,red,[.97,.43,.85],[0,.13,.05]);
    part(hat,cylinder,red,[.98,.14,.83],[0,-.04,.03]);
    box(hat,red,[1.43,.15,.81],[0,-.04,.78]);
    const badge=part(hat,cylinder,white,[.26,.05,.26],[0,.22,.81]);badge.rotation.x=Math.PI/2;
    for(const side of [-1,1]) {
      box(hat,red,[.065,.26,.028],[side*.145,.23,.855]);
      box(hat,red,[.055,.20,.028],[side*.065,.24,.86]).rotation.z=-side*.66;
      box(body,blue,[.24,1.23,.12],[side*.46,2.15,.91]);
      box(body,blue,[.23,1.20,.12],[side*.47,2.16,-.91]);
      ball(body,gold,[.10,.10,.07],[side*.46,2.36,1]);
    }
    box(body,blue,[1.24,.91,.21],[0,1.68,.93]);box(body,light,[.43,.32,.05],[0,1.81,1.055]);
    ball(head,light,[.27,.22,.24],[0,-.08,1.38]);
    for(let k=0;k<6;k++)ball(head,ink,[.15,.14,.07],[(k-2.5)*.17,-.30+Math.abs(k-2.5)*.035,1.35]);
    for(const side of [-1,1])box(head,ink,[.31,.09,.13],[side*.54,.60,.89]).rotation.z=-side*.1;
    box(body,red,[1.60,.43,1.16],[0,2.44,.05]);
  } else if(style==='drift') {
    // Drift-inspired kitsune mask, pink/gold coat and energy pickaxe on the back.
    ball(head,suit,[1.04,.84,.93],[0,.24,-.02]);
    ball(head,white,[.88,.71,.33],[0,.16,.89]);
    ball(head,white,[.50,.34,.34],[0,-.25,1.03]);
    for(const side of [-1,1]) {
      cone(head,white,[.31,.97,.24],[side*.59,.96,.67]).rotation.z=-side*.20;
      cone(head,pink,[.17,.62,.10],[side*.60,.98,.91]).rotation.z=-side*.20;
      box(head,ink,[.51,.12,.09],[side*.40,.20,1.18]).rotation.z=side*.22;
      box(head,pink,[.10,.40,.09],[side*.62,-.04,1.14]).rotation.z=-side*.48;
      box(head,gold,[.14,.43,.10],[side*.24,.56,1.13]).rotation.z=side*.55;
      box(body,pink,[.19,1.28,.17],[side*.61,2.05,.88]);
      box(body,gold,[.075,1.28,.18],[side*.45,2.05,.89]);
      const flap=box(body,suit,[.61,1.13,.16],[side*.69,1.05,-.67]);flap.rotation.z=side*.17;
      box(body,pink,[.61,.19,.19],[side*.76,.56,-.68]);
    }
    cone(head,ink,[.16,.17,.09],[0,-.18,1.39]).rotation.z=Math.PI;
    box(body,white,[.64,1.06,.22],[0,2.02,1.01]);
    box(body,gold,[1.46,.15,1.4],[0,1.43,0]);
    const tool=new THREE.Group();tool.position.set(-.10,2.05,-1.05);tool.rotation.z=-.55;body.add(tool);
    part(tool,cylinder,ink,[.11,2.2,.11],[0,.12,0]);
    box(tool,gold,[.36,.22,.27],[0,1.08,0]);
    for(const side of [-1,1]) {
      box(tool,glow,[.85,.19,.23],[side*.48,1.04,0]).rotation.z=-side*.22;
      cone(tool,glow,[.20,.55,.15],[side*.91,.83,0]).rotation.z=side*2.5;
    }
    prop=tool;
  } else {
    // Wide snout, visible teeth, dorsal scutes and segmented belly.
    for(let row=0;row<4;row++)box(body,belly,[1.13-row*.08,.15,.11],[0,1.43+row*.29,1.07]);
    for(const side of [-1,1]) {
      for(let k=0;k<4;k++)cone(head,white,[.095,.24,.11],[side*.65,-.52,.43+k*.40]).rotation.z=Math.PI;
      for(let k=0;k<4;k++)part(body,gem,light,[.17,.22,.17],[side*.80,1.53+k*.28,.26]);
      for(let k=0;k<3;k++)cone(arms[side>0?1:0],white,[.07,.19,.07],[side*.09+(k-1)*.14,-.49,.52]).rotation.x=Math.PI/2;
    }
    for(let k=0;k<4;k++)for(const side of [-1,1])cone(body,skin,[.18,.31,.24],[side*.27,2.68-k*.24,-.69-k*.09]);
    for(let k=0;k<4;k++)for(const side of [-1,1])cone(tail,light,[.12,.20,.16],[side*.20, .39-k*.05,-.38-k*.38]);
  }

  let squash=0;
  return {
    object:root, head,
    update(p,dt,time=0) {
      const idle=p.state==='idle',beat=Math.sin(p.gait),energy=Math.min(1.35,p.speed/26);
      body.position.y=p.grounded?Math.abs(Math.cos(p.gait))*(idle?.065:.14):0;
      body.rotation.z=-p.steer*(p.state==='slide'?.32:.16)+(idle?Math.sin(time*1.8)*.025:0);
      body.rotation.x=(p.state==='stumble'?.37:.055)+(p.boost?.13:0);
      legs.forEach((leg,i)=>{leg.rotation.x=p.grounded?beat*(i?-1:1)*energy*(idle?.10:.76):-.63;});
      arms.forEach((arm,i)=>{arm.rotation.x=p.grounded?beat*(i?1:-1)*(style==='vader'&&i===1?.18:.37):-.66;});
      if(p.state==='slide'){legs[0].rotation.x=.80;legs[1].rotation.x=-.34;}
      tail.rotation.y=beat*(style==='alligator'?.29:.18);tail.rotation.x=p.grounded?-.04:-.3;
      head.rotation.y=p.steer*.18+(idle?Math.sin(time*.9)*.07:0);head.rotation.x=Math.cos(p.gait)*.035;
      if(hat)hat.rotation.z=beat*.024;
      if(prop)prop.rotation.x=Math.sin(time*2)*.025;
      if(cape) {
        const pos=cape.geometry.attributes.position;
        for(let i=0;i<pos.count;i++) { const x=capeRest[i*3],y=capeRest[i*3+1],v=(2.7-y)/2.43;
          pos.setXYZ(i,x+Math.sin(time*4+v*3)*v*.075,y,capeRest[i*3+2]+Math.sin(time*5+v*4+x*3)*v*(idle?.045:.15)-(p.boost?.22*v:0));
        }
        pos.needsUpdate=true;cape.geometry.computeVertexNormals();
      }
      squash=Math.max(0,squash-dt*5);const stretch=p.grounded?1-squash*.20:1.05;
      body.scale.set(1/Math.sqrt(stretch),stretch,1/Math.sqrt(stretch));
    },
    onEvent(type,payload) { if(type==='runner:land')squash=Math.min(1,payload.impact); },
    dispose() { geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose()); },
  };
});
