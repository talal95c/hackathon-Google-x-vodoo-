import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Étalonnage final + effets de vitesse (rush = aberration chromatique, lines = lignes de vitesse,
// blur = flou radial, flash = écran noyé dans flashColor) : voir la classe PostProcessing plus bas.
// AO at half resolution. Transparent light shafts must never become solid
// silhouettes in the normals/depth buffer.
class SceneAO extends GTAOPass {
  setSize(w, h) { super.setSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2))); }
  render(...args) {
    const hidden = [];
    this.scene.traverse(object => {
      if (object.visible && (object.userData.noAO || object.material?.transparent)) { hidden.push(object); object.visible = false; }
    });
    const shadows = args[0].shadowMap.autoUpdate;
    args[0].shadowMap.autoUpdate = false;
    try { super.render(...args); } finally { args[0].shadowMap.autoUpdate = shadows; hidden.forEach(object => { object.visible = true; }); }
  }
}

export class PostProcessing {
  constructor(renderer, scene, camera) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    target.samples = Math.min(4, renderer.capabilities.maxSamples);
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (!window.matchMedia('(pointer: coarse)').matches) {
      this.ao = new SceneAO(scene, camera, 512, 512);
      this.ao.updateGtaoMaterial({ radius: 2.1, thickness: 1.5, distanceExponent: 1.6, scale: 1, samples: 8 });
      this.ao.updatePdMaterial({ samples: 8, radius: 4 });
      this.ao.blendIntensity = .82;
      this.composer.addPass(this.ao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .30, .42, 1.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, time: { value: 0 }, aspect: { value: 1 },
        rush: { value: 0 }, lines: { value: 0 }, blur: { value: 0 },
        flash: { value: 0 }, flashColor: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; uniform float aspect;
        uniform float rush; uniform float lines; uniform float blur; uniform float flash; uniform vec3 flashColor;
        varying vec2 vUv;
        float hash(float n){ return fract(sin(n*127.1+311.7)*43758.5453); }
        vec3 fetch(vec2 uv, vec2 split){ return vec3(texture2D(tDiffuse,uv+split).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-split).b); }
        void main(){
          vec2 edge=vUv-.5;
          vec2 dir=edge*vec2(aspect,1.);
          float r=length(dir);
          vec2 split=edge*dot(edge,edge)*(.001+ rush*.010);
          vec3 c;
          if(blur>.002){
            // flou radial : 6 échantillons qui glissent vers le centre, nul au centre
            vec2 stride=edge*blur*.07*smoothstep(.08,.6,r);
            c=vec3(0.);
            for(int i=0;i<6;i++){ c+=fetch(vUv-stride*(float(i)/5.),split); }
            c/=6.;
          } else c=fetch(vUv,split);
          float l=dot(c,vec3(.2126,.7152,.0722));
          c=mix(vec3(l),c,1.13);
          c=(c-.5)*1.08+.5;
          c*=mix(vec3(.93,1.015,1.065),vec3(1.025,1.006,.965),smoothstep(.08,.85,l));
          if(lines>.001){
            // lignes de vitesse : secteurs angulaires, chacun avec sa largeur, sa phase et sa vitesse
            float a=atan(dir.y,dir.x)/6.2831853+.5;
            float seg=120.;
            float id=floor(a*seg);
            float h1=hash(id), h2=hash(id+7.3), h3=hash(id+19.7);
            float within=fract(a*seg)-.5;
            float line=1.-smoothstep(0.,.08+.14*h2,abs(within));
            float run=fract(r*(2.+h3*1.6)-time*(3.+6.*lines)+h1*7.);
            float dash=smoothstep(.1,.45,run)*smoothstep(1.,.7,run);
            float lit=smoothstep(h1-.12,h1,.22+.7*lines);         // plus on va vite, plus de secteurs s'allument
            float mask=smoothstep(.36-.18*lines,.74,r);             // le centre (le dino) reste net
            float v=line*dash*lit*mask*lines;
            vec3 ink=mix(vec3(1.),vec3(.1,.12,.18),smoothstep(.6,.9,l)); // blanc sur le sombre, encre sur le clair
            c=mix(c,ink,clamp(v*.95,0.,1.));
          }
          c*=1.-smoothstep(.12,.64,dot(edge,edge))*(.20+.16*lines);
          float grain=fract(sin(dot(gl_FragCoord.xy+mod(time,60.),vec2(12.9898,78.233)))*43758.5453)-.5;
          c+=grain*.0035;
          c=mix(c,flashColor,clamp(flash,0.,1.));
          gl_FragColor=vec4(clamp(c,0.,1.),1.);
        }`,
    });
    this.composer.addPass(this.grade);
  }
  resize(w,h,dpr){this.composer.setPixelRatio(dpr);this.composer.setSize(w,h);this.grade.uniforms.aspect.value=w/h;}
  // fx : { rush, lines, blur, flash, flashColor } (voir view/TransitionFx.js)
  render(pulse=0,fx=NONE){
    const u=this.grade.uniforms;
    this.bloom.strength=.30+pulse*.07+fx.rush*.10+fx.lines*.05;
    u.time.value=performance.now()/1000;
    u.rush.value=fx.rush; u.lines.value=fx.lines; u.blur.value=fx.blur; u.flash.value=fx.flash;
    if(fx.flashColor)u.flashColor.value.copy(fx.flashColor);
    this.composer.render();
  }
  dispose(){this.composer.passes.forEach(pass=>pass.dispose?.());this.composer.dispose();}
}
const NONE={rush:0,lines:0,blur:0,flash:0,flashColor:null};
