import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { TRACK } from '../src/kernel/config.js';
import { universeOrder, intersectsWorldSafe, WORLD_JUMP } from '../src/kernel/WorldJourney.js';
import { ZONES } from '../src/content/zones.js';
import { sculptureRecipe, createSculpture } from '../src/view/UniverseSculptures.js';
import { WorldDecorView } from '../src/view/WorldDecorView.js';
import { tunnelSpan } from '../src/view/TunnelView.js';

// Avoid canvas in the geometry-only Node test; the browser preview verifies labels.
class HeadlessDecor extends WorldDecorView {
  label(text) { if(!this.signs.has(text))this.signs.set(text,new THREE.MeshBasicMaterial({map:new THREE.Texture()}));return this.signs.get(text); }
}

test('seeded universe order and sculptures vary while preserving peer determinism',()=>{
  const orders=new Set();
  for(let seed=1;seed<=30;seed++) {
    const a=new Game({seed}),b=new Game({seed});a.start({seed});b.start({seed});
    orders.add(a.track.universes.join(','));
    assert.deepEqual(a.track.universes,b.track.universes);
    assert.equal(new Set(universeOrder(a.track.salt)).size,ZONES.length);
    const before=[a.rng.state,a.trackRng.state];
    for(let j=0;j<20;j++)assert.deepEqual(sculptureRecipe(a.track.salt,j,2,-1),sculptureRecipe(b.track.salt,j,2,-1));
    assert.deepEqual([a.rng.state,a.trackRng.state],before);
  }
  assert.ok(orders.size>12,'many distinct routes, not just one cyclic offset');
});

test('all twenty landmark compositions have finite geometry and a bounded footprint',()=>{
  const mat=new THREE.MeshBasicMaterial(),materials=Object.fromEntries(['base','white','dark','ground','glass','neon','gold','accent'].map(k=>[k,mat]));
  for(let theme=0;theme<5;theme++)for(let variant=0;variant<4;variant++) {
    const {pieces,motion}=createSculpture(theme,variant,42,materials);
    assert.ok(pieces.size>=3);
    for(const g of [...pieces.values()].flat()) {
      g.computeBoundingBox();
      const b=g.boundingBox;
      assert.ok([...b.min,...b.max].every(Number.isFinite));
      assert.ok(Math.max(Math.abs(b.min.x),Math.abs(b.max.x),Math.abs(b.min.z),Math.abs(b.max.z))<=11);
      g.dispose();
    }
    for(const m of motion){assert.ok(Number.isFinite(m.userData.motion.phase));m.geometry.dispose();}
  }
  mat.dispose();
});

test('new scenery leaves the road open and releases animated geometry on restart',()=>{
  const game=new Game({seed:42});game.start({seed:42});
  const world={scene:new THREE.Scene()},view=new HeadlessDecor({game,world});
  const ray=new THREE.Raycaster();ray.far=5.5;let probes=0;
  for(const s of [86,800,1780,3420,5100,6900,8480]) {
    game.runner.z=s;game.track.update(s);const random=[game.rng.state,game.trackRng.state];
    view.update(.016,1);assert.deepEqual([game.rng.state,game.trackRng.state],random);
    world.scene.updateMatrixWorld(true);
    for(let offset=0;offset<220;offset+=13) {
      const f=game.track.frame(s+offset,{});
      for(const lane of [-.75,0,.75]) {
        const d=lane*f.w/2;
        ray.set(new THREE.Vector3(f.x+f.lx*d,f.y+5,f.z+f.lz*d),new THREE.Vector3(0,-1,0));
        assert.equal(ray.intersectObjects([...view.chunks.values()],true).length,0,`scenery crosses road at ${s+offset}`);
        probes++;
      }
    }
    assert.ok(view.chunks.size<=7);
  }
  assert.ok(probes>300);
  game.start({seed:21});assert.equal(view.chunks.size,0);view.update(0,0);
  view.dispose();assert.equal(world.scene.children.length,0);
});

test('tunnel lengths, placements and profiles vary independently of gameplay randomness',()=>{
  const styles=new Set(),lengths=new Set();let count=0;
  for(let salt=1;salt<15;salt++)for(let index=1;index<40;index++) {
    const c={index,s0:index*120,s1:(index+1)*120,zone:0},t={salt,hardTurns:[]};
    const a=tunnelSpan(t,c);assert.deepEqual(a,tunnelSpan(t,c));
    if(!a)continue;count++;styles.add(a.style);lengths.add(Math.round(a.end-a.start));
    assert.ok(a.start>=c.s0&&a.end<=c.s1);
    assert.equal(intersectsWorldSafe(a.start-24,a.end+24),false);
  }
  assert.equal(styles.size,3);assert.ok(lengths.size>20);assert.ok(count>80);
});

test('portal safe intervals continue indefinitely with strict endpoint semantics',()=>{
  const b=23*TRACK.zoneLength,r=WORLD_JUMP.safe;
  assert.equal(intersectsWorldSafe(b-r-20,b-r),false);
  assert.equal(intersectsWorldSafe(b+r,b+r+20),false);
  assert.equal(intersectsWorldSafe(b-1,b+1),true);
});
