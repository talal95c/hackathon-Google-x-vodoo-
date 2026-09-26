import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
  constructor(renderer, scene, camera, mobile = false) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    if (mobile) return;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    target.samples = Math.min(4, renderer.capabilities.maxSamples);
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new SceneAO(scene, camera, 512, 512);
    this.ao.updateGtaoMaterial({ radius: 2.1, thickness: 1.5, distanceExponent: 1.6, scale: 1, samples: 8 });
    this.ao.updatePdMaterial({ samples: 8, radius: 4 });
    this.ao.blendIntensity = .6;
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .30, .42, 1.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 }, rush: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; uniform float rush; varying vec2 vUv;
        void main(){
          vec2 edge=vUv-.5;
          vec2 split=edge*dot(edge,edge)*(.001+ rush*.010);
          vec3 c=vec3(texture2D(tDiffuse,vUv+split).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-split).b);
          float l=dot(c,vec3(.2126,.7152,.0722));
          c=mix(vec3(l),c,1.13);
          c=(c-.5)*1.08+.5;
          c*=mix(vec3(.93,1.015,1.065),vec3(1.025,1.006,.965),smoothstep(.08,.85,l));
          c*=1.-smoothstep(.12,.64,dot(edge,edge))*.20;
          float grain=fract(sin(dot(gl_FragCoord.xy+mod(time,60.),vec2(12.9898,78.233)))*43758.5453)-.5;
          c+=grain*.0035;
          gl_FragColor=vec4(clamp(c,0.,1.),1.);
        }`,
    });
    this.composer.addPass(this.grade);
  }
  resize(w,h,dpr){
    if (!this.composer) return;
    this.composer.setPixelRatio(dpr);this.composer.setSize(w,h);
  }
  render(pulse=0,rush=0){
    if (!this.composer) { this.renderer.render(this.scene, this.camera); return; }
    this.bloom.strength=.30+pulse*.07+rush*.10;
    this.grade.uniforms.time.value=performance.now()/1000;
    this.grade.uniforms.rush.value=rush;
    this.composer.render();
  }
  dispose(){if (this.composer) {this.composer.passes.forEach(pass=>pass.dispose?.());this.composer.dispose();}}
}
