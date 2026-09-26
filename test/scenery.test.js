import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { TunnelView, tunnelSpan } from '../src/view/TunnelView.js';
import { DioramaView } from '../src/view/DioramaView.js';
import { SideLightShow } from '../src/view/SideLightShow.js';
import { isWorldSafe } from '../src/kernel/WorldJourney.js';

test('tunnels : une voie dégagée, même dans les courbes, sans couvrir les portails', () => {
  let checked=0;
  for(const seed of [9,42,175]) {
    const game=new Game({seed});game.start({seed});
    const world={scene:new THREE.Scene()},ctx={game,world},view=new TunnelView(ctx);
    const ray=new THREE.Raycaster();ray.far=6;
    for(let s=0;s<3600;s+=120) {
      game.runner.z=s;game.track.update(s);view.update(0);
      world.scene.updateMatrixWorld(true);
      for(const root of view.chunks.values()) {
        const span=root.userData.span;if(!span)continue;
        for(let d=span.start+2;d<span.end-2;d+=9) {
          assert.equal(isWorldSafe(d),false);
          const f=game.track.frame(d,{});
          for(const lane of [-1,0,1]) {
            const x=lane*(f.w/2-.7);
            ray.set(new THREE.Vector3(f.x+f.lx*x,f.y+6,f.z+f.lz*x),new THREE.Vector3(0,-1,0));
            assert.equal(ray.intersectObject(root,true).length,0,`route obstruée à ${d}, seed ${seed}`);
            checked++;
          }
        }
      }
      assert.ok(view.chunks.size<=7);
    }
    view.dispose();assert.equal(world.scene.children.length,0);
  }
  assert.ok(checked>300);
});

test('décors : streaming et redémarrage libèrent les anciennes scènes',()=>{
  const game=new Game({seed:42});game.start({seed:42});const world={scene:new THREE.Scene()},ctx={game,world};
  const views=[new DioramaView(ctx),new SideLightShow(ctx),new TunnelView(ctx)];
  const before=game.track.X.slice();views.forEach(v=>v.update(0,0));assert.deepEqual(game.track.X,before);
  for(const s of [400,800,1700,3000]) {game.runner.z=s;game.track.update(s);views.forEach(v=>v.update(0,0));views.forEach(v=>assert.ok(v.chunks.size<=7));}
  game.start({seed:42});views.forEach(v=>{assert.equal(v.chunks.size,0);v.update(0,0);assert.ok(v.chunks.has(0));});
  views.forEach(v=>v.dispose());assert.equal(world.scene.children.length,0);assert.equal(world.enclosure,0);
});

test('les tunnels sont retirés autour des virages en épingle',()=>{
  const chunk={index:1,s0:120,s1:240,zone:0};
  assert.ok(tunnelSpan({hardTurns:[]},chunk));
  assert.equal(tunnelSpan({hardTurns:[{s:210,end:235}]},chunk),null);
});
