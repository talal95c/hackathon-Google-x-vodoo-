import { Random } from './Random.js';

export const ROAD_SECTION_LENGTH = 240;
const smooth = x => { const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t); };

// Independent, cached RNG stream: neither terrain reads nor render order can
// change the collision road. Zero derivative at joins prevents invisible steps.
export class RoadProfiles {
  constructor(salt) { this.salt=salt;this.sections=new Map(); }
  section(s) {
    const index=Math.max(0,Math.floor(s/ROAD_SECTION_LENGTH));
    if(!this.sections.has(index)) {
      const r=new Random(`road-shape-${this.salt}-${index}`);
      this.sections.set(index,{
        index, style:r.pick(['ribbon','viaduct','ripple','terrace']),
        rise:r.range(4.5,10), waves:r.chance(.35)?2:1,
        widen:r.range(1.5,5), phase:r.range(0,Math.PI*2),
        cadence:r.pick([12,16,20]),
      });
    }
    return this.sections.get(index);
  }
  sample(s) {
    const section=this.section(s),p=(Math.max(0,s)%ROAD_SECTION_LENGTH)/ROAD_SECTION_LENGTH;
    const wave=Math.sin(Math.PI*p),envelope=wave*wave;
    // The first 110 m remain a gentle launch. Later humps alter real elevation.
    const start=smooth((s-110)/85);
    const shape=section.style==='ripple'?Math.sin(Math.PI*p*section.waves)**2:envelope;
    const elevation=start*section.rise*shape;
    const widen=section.widen*envelope;
    return {elevation,widen,section};
  }
}

// Shared by the local runner and solo rivals; MQTT peers use the same Game
// rule. Above the ceramic rim a jump is free to leave the track.
export function bounceOnBowl(actor, width, lateralKey='x') {
  const x=actor[lateralKey],half=width/2;
  if(actor.y>=3.5||Math.abs(x)<=half-.35||Math.abs(x)>=half+3.5)return false;
  const side=Math.sign(x);
  actor[lateralKey]=side*(half-.35);
  actor.latV=-side*Math.abs(actor.latV)*.35;
  actor.knockV=-side*Math.abs(actor.knockV)*.3;
  actor.speed*=.94;
  return true;
}
