import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// HDR bloom is deliberately restrained; MSAA keeps the polygon silhouettes crisp.
export class PostProcessing {
  constructor(renderer, scene, camera) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    target.samples = Math.min(4, renderer.capabilities.maxSamples);
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.45, 1.12);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, vignette: { value: 0.13 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float vignette;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          // Preserve the original browser-world palettes without a warm color cast.
          vec2 edge = (vUv - .5) * 1.35;
          c *= 1. - smoothstep(.15, .8, dot(edge, edge)) * vignette;
          gl_FragColor = vec4(max(c, 0.), 1.);
        }`,
    });
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  resize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }
  render(pulse = 0) {
    this.bloom.strength = 0.2 + pulse * 0.025;
    this.composer.render();
  }
  dispose() {
    this.composer.passes.forEach((pass) => pass.dispose?.());
    this.composer.dispose();
  }
}
