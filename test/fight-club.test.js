import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { CLUB, TapDuel } from '../src/fight/TapDuel.js';
import { FightClub } from '../src/fight/FightClub.js';
import { Game } from '../src/kernel/Game.js';
import { Profile } from '../src/meta/Profile.js';
import { MemoryStorage } from '../src/meta/Storage.js';
import { Multiplayer } from '../src/net/Multiplayer.js';
import { Bots } from '../src/bots/Bots.js';
import { ZONES } from '../src/content/zones.js';
import { Entities } from '../src/kernel/Registry.js';

const roster = [{id:'a',coins:17},{id:'b',coins:50}];
test('Fight Club : exactement 3 secondes, aucune frappe anticipée/tardive ni maintien automatique',()=>{
 const d=new TapDuel(roster,100);
 assert.equal(d.remaining(100),3000);
 assert.equal(d.tap(0,1899),false);
 for(let t=1900;t<4900;t+=50){assert.equal(d.tap(0,t),true);assert.equal(d.tap(0,t+1),false);}
 assert.equal(d.counts[0],60);assert.equal(d.tap(0,4900),false);assert.equal(d.tap(0,9900),false);
 assert.equal(d.phase(4900),'judging');assert.equal(d.remaining(10000),0);
 assert.equal(d.merge(1,61),false);assert.equal(d.merge(1,NaN),false);assert.equal(d.merge(1,12.5),false);
 assert.equal(d.merge(1,13),true);assert.equal(d.merge(1,12),false);
});
test('Fight Club : vol plafonné, conservatif, et égalité sans pénalité',()=>{
 const d=new TapDuel(roster,0);d.merge(0,25);d.merge(1,14);
 assert.deepEqual(d.resolve(),{counts:[25,14],winner:0,loser:1,transfer:20});
 const poor=new TapDuel([{coins:0},{coins:3}],0);poor.merge(0,1);assert.equal(poor.resolve().transfer,2);
 const draw=new TapDuel(roster,0);draw.merge(0,12);draw.merge(1,12);assert.equal(draw.resolve().winner,null);assert.equal(draw.resolve().transfer,0);
});
function solo(){
 let clock=0;const g=new Game({seed:11}),profile=new Profile(new MemoryStorage()),mp=new Multiplayer(g,profile),bots=new Bots(g,1);
 const club=new FightClub(g,{mp,bots,profile,now:()=>clock});g.start({seed:11});bots.start();g.coins=16;bots.list[0].coins=32;
 return{g,club,bots,clock:(t)=>clock=t};
}
test('solo : pause des physiques, butin une seule fois, ralentissement du seul perdant, reprise',()=>{
 const {g,club,bots,clock}=solo();const z=g.runner.z,hearts=g.lives,bank=g.coins+bots.list[0].coins;
 assert.equal(club.startSolo(),true);const ids=g.entities.map(e=>e.s);
 for(let i=0;i<10;i++)g.update(.1,{steer:1,throttle:1,jump:true});
 assert.equal(g.runner.z,z);assert.deepEqual(g.entities.map(e=>e.s),ids);
 for(let t=CLUB.introMs;t<CLUB.introMs+CLUB.tapMs;t+=90){clock(t);club.update();club.tap();}
 clock(4801);club.update();assert.equal(club.result.winner,0);assert.equal(g.coins,32);assert.equal(bots.list[0].coins,16);
 assert.equal(g.coins+bots.list[0].coins,bank);assert.equal(bots.list[0].clubSlow,5);
 club.settle(club.result);assert.equal(g.coins,32);
 clock(8000);club.update();assert.equal(g.state,'playing');assert.equal(g.runner.z,z);assert.equal(g.lives,hearts);
 assert.equal(g.runner.effects.has('fightSlow'),false);assert.equal(g.pendingJump,false);
});
test('solo : perdre ralentit 5 s, conserve les vies ; une égalité ne vole rien',()=>{
 const {g,club,clock}=solo();club.startSolo();clock(5000);club.update();
 assert.equal(club.result.winner,1);assert.equal(g.coins,8);assert.equal(g.lives,3);
 const effect=g.runner.effects.get('fightSlow');assert.equal(effect.timeLeft,5);assert.equal(g.runner.stats.get('baseSpeed'),34*.65);
 clock(8000);club.update();for(let i=0;i<310;i++)g.runner.update(1/60,{steer:0,throttle:0},{y:0,vy:0,slope:0,k:0,hard:false});
 assert.equal(g.runner.effects.has('fightSlow'),false);assert.equal(g.runner.stats.get('baseSpeed'),34);
});

async function network(delay=0){
 let now=0,seq=0;const members=new Map(),queue=[],log=[];
 const connectFn=async(room,cb)=>{const id=`p${++seq}`,handlers=new Map();members.set(id,{handlers,cb});return{selfId:id,transport:'memory',channel:name=>({on:f=>handlers.set(name,f),send:(data,to)=>{for(const pid of members.keys())if(pid!==id&&(!to||pid===to)){const m={at:now+delay,from:id,to:pid,name,data:structuredClone(data)};queue.push(m);log.push(m);}}}),leave:()=>{members.delete(id);for(const p of members.values())p.cb.onPeerLeave?.(id);}};};
 const flush=()=>{for(let loop=0;loop<20;loop++){const due=queue.filter(m=>m.at<=now);if(!due.length)break;for(const m of due){queue.splice(queue.indexOf(m),1);members.get(m.to)?.handlers.get(m.name)?.(m.data,m.from);}}};
 const ps=[];
 for(let i=0;i<3;i++){
  const g=new Game({seed:1}),profile=new Profile(new MemoryStorage()),mp=new Multiplayer(g,profile,{connectFn}),bots=new Bots(g,1),club=new FightClub(g,{mp,bots,profile,now:()=>now});
  mp.on('start',({seed})=>g.start({seed}));if(!i)await mp.create();else await mp.join(ps[0].mp.code);ps.push({g,mp,club});
 }
 for(const p of ps)p.mp.setName(p.mp.net.selfId);
 const step=(ms=10)=>{now+=ms;flush();for(const p of ps)p.mp.update(ms/1000,{});flush();for(const p of ps)p.club.update();flush();};
 for(let i=0;i<20;i++)step();ps[0].mp.startRace();for(let i=0;i<20;i++)step();
 for(let i=0;i<ps.length;i++){ps[i].g.runner.z=100;ps[i].g.runner.x=i*4;ps[i].g.runner.speed=0;ps[i].g.coins=20+i*10;}
 for(let i=0;i<25;i++)step();
 return {ps,step,log,now:()=>now,inject:(to,data,from='p1')=>members.get(to)?.handlers.get('fc')?.(data,from),disconnect:i=>ps[i].mp.leave()};
}
test('réseau retardé : deux participants, un spectateur, même résultat et même transfert sans doublons',async()=>{
 const {ps,step,inject,log}=await network(60);const[a,b,c]=ps;
 assert.equal(a.club.startMultiplayer(),true);
 for(let i=0;i<20;i++)step();assert.ok(ps.every(p=>p.club.active));assert.equal(c.club.localIndex,-1);
 const total=ps.reduce((s,p)=>s+p.g.coins,0);let tick=0;
 for(let i=0;i<630;i++){
  if(i%8===0)a.club.tap();if(i%20===0)b.club.tap();step();tick++;
 }
 assert.ok(a.club.result);assert.equal(a.club.result.winner,0);assert.deepEqual(a.club.result,b.club.result);assert.deepEqual(a.club.result,c.club.result);
 assert.equal(a.g.coins,35);assert.equal(b.g.coins,15);assert.equal(c.g.coins,40);assert.equal(ps.reduce((s,p)=>s+p.g.coins,0),total);
 assert.equal(b.g.runner.effects.has('fightSlow'),true);assert.equal(c.g.runner.effects.has('fightSlow'),false);
 const packet=log.find(m=>m.name==='fc'&&m.data.type==='result').data;inject('p2',packet);inject('p2',packet);assert.equal(b.g.coins,15);
 for(let i=0;i<300;i++)step();assert.ok(ps.every(p=>p.g.state==='playing'));assert.ok(ps.every(p=>!p.club.active));
 inject('p2',packet);assert.equal(b.g.coins,15);
});
test('réseau : paquet étranger ignoré ; déconnexion avant résultat annule sans vol ni pénalité',async()=>{
 const {ps,step,inject,disconnect}=await network();const[a,b,c]=ps;a.club.startMultiplayer();for(let i=0;i<10;i++)step();
 inject('p2',{id:b.club.id,type:'result',result:{counts:[0,60],winner:1,loser:0,transfer:10}},'p3');assert.equal(b.club.result,null);
 const money=a.g.coins;disconnect(1);for(let i=0;i<5;i++)step();
 assert.equal(a.club.active,false);assert.equal(a.g.coins,money);assert.equal(a.g.runner.effects.has('fightSlow'),false);assert.equal(a.g.state,'playing');
 assert.equal(c.club.active,false);
});
test('déclenchement à 140 m, pas dans un portail ; la course suivante repart avec un duel neuf',()=>{
 const {g,club,clock}=solo();g.sMax=140;g.worldJump={};club.update();assert.equal(club.active,false);g.worldJump=null;club.update();assert.equal(club.active,true);
 clock(20);g.start({seed:12});assert.equal(club.active,false);assert.equal(club.nextAt,140);assert.equal(g.state,'playing');
});
test('cookies : davantage de vrais obstacles dans chaque monde, aucune confusion avec les pièces',()=>{
 for(const z of ZONES){const cookie=z.spawns.find(s=>s.type==='rollingCookie');assert.ok(cookie&&cookie.weight>=1.5,z.id);}
 const g=new Game({seed:11});const e=g.spawn('rollingCookie',20,0);assert.equal(e.kind,'enemy');
 assert.ok(Entities.get('rollingCookie').motion.roll>0);assert.equal(e.hitbox.top,Infinity);
});


test('réseau : un score final perdu annule le duel et débloque la course sans prendre de pièces',async()=>{
 const {ps,step}=await network();const[a,b]=ps;a.club.startMultiplayer();for(let i=0;i<10;i++)step();
 b.club.update=()=>{};const balances=ps.map(p=>p.g.coins);
 for(let i=0;i<800;i++)step();
 assert.ok(ps.every(p=>!p.club.active&&p.g.state==='playing'));
 assert.deepEqual(ps.map(p=>p.g.coins),balances);assert.ok(ps.every(p=>!p.g.runner.effects.has('fightSlow')));
});

import { Input } from '../src/input/Input.js';
test('mobile/clavier : la saisie de course est vidée pendant le duel, aucun saut ni direction conservés',()=>{
 const target=new EventTarget(),input=new Input(target);
 const key=code=>{const e=new Event('keydown',{cancelable:true});Object.defineProperty(e,'code',{value:code});target.dispatchEvent(e);};
 key('KeyW');key('ArrowLeft');key('Space');input.enabled=false;
 assert.deepEqual(input.read(.1),{steer:0,throttle:0,drift:false,brake:false,jump:false,shove:false});
 input.enabled=true;assert.deepEqual(input.read(.1),{steer:0,throttle:0,drift:false,brake:false,jump:false,shove:false});
});
