// Point d'assemblage : crée le kernel, branche les vues, le son, la musique et l'interface.
// C'est le seul fichier qui connaît tout le monde.
import * as THREE from 'three';

// Contenu (registres) puis modèles 3D associés
import './content/index.js';
import './view/models/entities.js';
import './view/models/decor.js';
import './view/models/blockDino.js';
import './view/models/reggaeDino.js';
import './view/models/weapons.js';

import { Game } from './kernel/Game.js';
import { LocalStorage } from './meta/Storage.js';
import { Profile } from './meta/Profile.js';
import { Shop } from './meta/Shop.js';
import { World } from './view/World.js';
import { TrackView } from './view/TrackView.js';
import { SideLightShow } from './view/SideLightShow.js';
import { WorldDecorView } from './view/WorldDecorView.js';
import { EntityViews } from './view/EntityViews.js';
import { RunnerView } from './view/RunnerView.js';
import { ChaserView } from './view/ChaserView.js';
import { Particles } from './view/Particles.js';
import { CameraRig } from './view/CameraRig.js';
import { BeatFx } from './view/BeatFx.js';
import { Input } from './input/Input.js';
import { Sfx, bindSfx } from './audio/Sfx.js';
import { LyriaEngine } from './audio/music/LyriaEngine.js';
import { SynthEngine } from './audio/music/SynthEngine.js';
import { MusicDirector } from './audio/music/MusicDirector.js';
import { Hud } from './ui/Hud.js';
import { Menus } from './ui/Menus.js';
import { MusicThemes } from './kernel/Registry.js';

// Jeu de marque (brand.html) : undefined dans le jeu principal
const BRAND = globalThis.DINO_BRAND;

// --- Logique
const game = new Game();
const profile = new Profile(new LocalStorage(), BRAND?.profileKey);
const shop = new Shop(profile, game.bus);

// --- Rendu (l'ordre compte : RunnerView met à jour ctx.focus pour les suivants)
const world = new World();
game.on('zone', ({ zone }) => world.setPalette(zone.palette));
const ctx = { game, world, focus: new THREE.Vector3(), skin: profile.data.skin };
const views = [
  new BeatFx(ctx),      // en premier : fournit ctx.fx et ctx.beatMaterials
  new TrackView(ctx),
  new WorldDecorView(ctx),
  new SideLightShow(ctx),
  new EntityViews(ctx),
  new RunnerView(ctx),
  new ChaserView(ctx),
  new Particles(ctx),
  new CameraRig(ctx),
];
for (const V of BRAND?.views ?? []) views.push(new V(ctx));

// --- Son et musique
const sfx = new Sfx();
bindSfx(game, sfx);
const lyria = new LyriaEngine();
const music = new MusicDirector(game, { lyria, synth: new SynthEngine() });
sfx.onInit = (audioCtx) => music.setAudioContext(audioCtx);
// Connexion Lyria dès le chargement (le WebSocket n'a pas besoin d'un clic) : musique live prête au 1er départ
if (lyria.hasKey()) lyria.connect();

// --- Interface
const hud = new Hud(game, profile);
const input = new Input();
const menus = new Menus({ game, profile, shop, lyria, music, onPlay: play });
let overAt = 0;

function play() {
  sfx.init(); // l'audio ne peut démarrer qu'après une action du joueur
  if (lyria.hasKey() && !lyria.ready && lyria.status !== 'connecting') lyria.connect();
  menus.show(null);
  game.start({ ...shop.prepareRun(), challenge: profile.data.challenge });
}

input.onAction((a) => {
  if (a !== 'confirm' || menus.panelOpen) return;
  if (game.state === 'menu' || (game.state === 'over' && performance.now() - overAt > 900)) play();
});

game.on('game:start', ({ loadout }) => hud.setMusicLabel(`🎵 ${MusicThemes.get(loadout.theme).name}${lyria.ready ? ' · Lyria' : ''}`));
lyria.onStatus((status) => { if (status === 'playing') hud.setMusicLabel(`🎵 ${lyria.theme.name} · Lyria live`); });
game.on('game:over', (result) => {
  overAt = performance.now();
  const record = profile.recordRun(result);
  hud.setBest(record.best);
  setTimeout(() => menus.showGameOver(result, record), 700);
});

// --- Boucle
let last = performance.now(), time = 0;
hud.setTitle(BRAND?.title ?? 'Dino Escape');

function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000);
  last = now;
  time += dt;
  input.enabled = !menus.panelOpen;
  game.update(dt, input.read(dt));
  for (const v of views) v.update(dt, time);
  music.update(dt);
  hud.update(dt);
  world.update(dt, ctx.focus);
  world.render(ctx.fx?.pulse ?? 0, game.worldJump ? Math.sin(game.worldJump.progress * Math.PI) : game.feverTime > 0 ? 1 : game.runner.boost > 0 ? .8 : 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug depuis la console : __dino.game.runner, __dino.profile.earn(1000)…
window.__dino = { game, profile, shop, lyria, music };
