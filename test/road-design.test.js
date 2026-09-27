import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { RoadProfiles, ROAD_SECTION_LENGTH } from '../src/kernel/RoadProfiles.js';
import { buildRoadArchitecture, disposeRoadArchitecture } from '../src/view/RoadArchitecture.js';
import { TRACK } from '../src/kernel/config.js';
import { isWorldSafe } from '../src/kernel/WorldJourney.js';

test('road profiles vary real elevation and width without discontinuities or RNG coupling',()=>{
  const a=new RoadProfiles(42),b=new RoadProfiles(42),other=new RoadProfiles(73),styles=new Set();
  let varied=0;
  for(let s=0;s<6000;s+=2) {
    const p=a.sample(s);assert.deepEqual(p,b.sample(s));styles.add(p.section.style);
    assert.ok(p.widen>=0&&p.widen<=5);
    assert.ok(p.elevation>=0&&p.elevation<=10);
    assert.ok(Math.abs(p.elevation-a.sample(s+.1).elevation)<.06,'smooth hill slope');
    if(Math.abs(p.elevation-other.sample(s).elevation)>.5)varied++;
  }
  assert.equal(styles.size,4);assert.ok(varied>100);
  for(let s=ROAD_SECTION_LENGTH;s<6000;s+=ROAD_SECTION_LENGTH) {
    assert.ok(Math.abs(a.sample(s-.001).elevation-a.sample(s+.001).elevation)<.001);
    assert.ok(Math.abs(a.sample(s-.001).widen-a.sample(s+.001).widen)<.001);
  }
  const ga=new Game({seed:18}),gb=new Game({seed:18});ga.start({seed:18});gb.start({seed:18});
  for(let s=0;s<5000;s+=31)ga.track.frame(s);
  gb.track.ensure(5034);ga.track.ensure(5034);
  assert.deepEqual(ga.track.Y,gb.track.Y);assert.deepEqual(ga.track.W,gb.track.W);
  for(let i=1;i<ga.track.Y.length;i++)assert.ok(Math.abs((ga.track.Y[i]-ga.track.Y[i-1])/TRACK.step-ga.track.SL[i])<1e-10,'physics slope matches rendered deck');
});

test('route architecture leaves running and jumping corridors clear across curves and portals',()=>{
  let checked=0;const themes=new Set();
  for(const seed of [9,42,175]) {
    const g=new Game({seed});g.start({seed});
    const ray=new THREE.Raycaster();ray.far=7.5;
    for(let s=0;s<8500;s+=360) {
      g.runner.z=s;g.track.update(s);
      const chunk=g.track.chunks.find(c=>c.s0<=s&&c.s1>s);themes.add(chunk.zone);
      const random=[g.rng.state,g.trackRng.state];
      const root=buildRoadArchitecture(g.track,chunk);root.updateMatrixWorld(true);
      assert.deepEqual([g.rng.state,g.trackRng.state],random,'rendering does not consume simulation random');
      for(let d=chunk.s0+3;d<chunk.s1-3;d+=7) {
        const f=g.track.frame(d,{});
        for(const lane of [-.85,0,.85]) {
          const x=lane*f.w/2;
          ray.set(new THREE.Vector3(f.x+f.lx*x,f.y+8,f.z+f.lz*x),new THREE.Vector3(0,-1,0));
          const hits=ray.intersectObject(root,true);
          assert.equal(hits.length,0,`architecture in playable corridor: seed ${seed}, theme ${chunk.zone}, distance ${d}, lane ${lane}, world-safe ${isWorldSafe(d)}`);
          checked++;
        }
      }
      root.traverse(o=>{if(o.geometry){o.geometry.computeBoundingBox();assert.ok([...o.geometry.boundingBox.min,...o.geometry.boundingBox.max].every(Number.isFinite));}});
      disposeRoadArchitecture(root);
    }
  }
  assert.equal(themes.size,5);assert.ok(checked>3000);
});

test('Poolside bowl walls catch low side impacts but an airborne dino can clear the rim',()=>{
  const g=new Game({seed:42});g.start({seed:42,respawn:true});
  const s=g.track.universes.indexOf(2)*TRACK.zoneLength+75,r=g.runner;
  g.track.update(s);const f=g.track.frame(s,{});g.zoneIndex=2;g.nextWorld=Math.floor(s/TRACK.zoneLength)+1;
  r.z=s;r.Y=f.y;r.y=0;r.grounded=true;r.speed=24;r.x=f.w/2+.4;r.latV=8;r.invul=99;g.sMax=s;
  const lives=g.lives;g.update(1/60,{steer:1,jump:false,drift:false,brake:false});
  assert.equal(g.state,'playing');assert.equal(g.lives,lives);
  assert.ok(r.x<=g.track.frame(r.z).w/2+.01);assert.ok(r.latV<0,'wall rebounds toward the track');
  r.x=f.w/2+1;r.grounded=false;r.Y=f.y+5;r.y=5;r.vy=0;
  g.update(1/60,{steer:1,jump:false,drift:false,brake:false});
  assert.ok(r.x>f.w/2,'jump above rim is not clamped');
});
