import * as THREE from 'three';
import { ZONES } from '../content/zones.js';

// Analytic material patterns: no bitmap downloads and no repeated center dashes.
// UVs are metres along/across the collision surface, so bends do not stretch tiles.
export function roadSurface(theme) {
  const z=ZONES[theme],material=new THREE.MeshStandardMaterial({
    color:z.palette.road,roughness:theme===2?.3:.69,metalness:theme===4?.28:0,
    side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,
  });
  material.onBeforeCompile=shader=>{
    shader.uniforms.roadInk={value:new THREE.Color([0xe9849f,0x81bba0,0x7bc9d8,0x2c2441,0x546488][theme])};
    shader.uniforms.roadCream={value:new THREE.Color([0xffe8b3,0xcce7aa,0xffedd3,0xecc7a2,0xc0dce9][theme])};
    shader.vertexShader='varying vec2 vRoadUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvRoadUv=uv;');
    shader.fragmentShader='varying vec2 vRoadUv;uniform vec3 roadInk,roadCream;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 q=vRoadUv;
      float ink=0.; float detail=0.;
      ${[
        // Diagonal taffy ribbons, with a lighter racing corridor.
        `ink=smoothstep(.44,.48,fract(q.y*.085+q.x*.10));
         detail=1.-smoothstep(.015,.045,abs(fract(q.y*.085+q.x*.10)-.5));`,
        // Veins branch out from a glowing organic central stem.
        `ink=.6+.12*sin(q.y*.16);float vein=abs(sin(q.y*.56-abs(q.x)*.7));
         detail=(1.-smoothstep(.035,.12,vein))*.4+(1.-smoothstep(.10,.18,abs(q.x)))*.4;`,
        // Pool tiles, fine grout and alternating large ceramic panels.
        `vec2 cell=floor(q/2.);ink=mod(cell.x+cell.y,2.)*.20+.48;
         vec2 line=abs(fract(q/2.)-.5);detail=smoothstep(.465,.495,max(line.x,line.y))*.45;`,
        // Giant piano keys: white/black lengths follow the bends in metres.
        `float key=mod(floor(q.y/3.),7.);ink=step(.5,key)*step(key,5.5)*step(2.5,abs(q.x));
         detail=1.-smoothstep(.025,.065,min(fract(q.y/3.),1.-fract(q.y/3.)));`,
        // Segmented magnetic track, luminous panel seams and a central spine.
        `ink=.48+.12*step(.5,fract(q.x*.28));
         detail=(1.-smoothstep(.02,.065,abs(fract(q.y/7.)-.5)))*.3;
         detail+= (1.-smoothstep(.05,.12,abs(abs(q.x)-1.8)))*.55;`,
      ][theme]}
      diffuseColor.rgb=mix(roadCream,roadInk,clamp(ink,0.,1.));
      diffuseColor.rgb=mix(diffuseColor.rgb,roadCream,clamp(detail,0.,.7));
    `);
  };
  material.customProgramCacheKey=()=>`surreal-road-${theme}`;
  return material;
}
