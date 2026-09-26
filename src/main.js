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
import { registerSiteModels, setSiteImage } from './view/models/site.js';

import { Game } from './kernel/Game.js';
import { LocalStorage } from './meta/Storage.js';
import { Profile } from './meta/Profile.js';
import { Shop } from './meta/Shop.js';
import { World } from './view/World.js';
import { TrackView } from './view/TrackView.js';
import { SideLightShow } from './view/SideLightShow.js';
import { WorldDecorView } from './view/WorldDecorView.js';
import { DioramaView } from './view/DioramaView.js';
import { TunnelView } from './view/TunnelView.js';
import { SiteDecorView } from './view/SiteDecorView.js';
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
import { SitePanel } from './ui/SitePanel.js';
import { installSite, activateSite, restoreWorlds } from './ai/SiteWorld.js';
import { Multiplayer } from './net/Multiplayer.js';
import { Lobby } from './ui/Lobby.js';
import { RivalView } from './view/RivalView.js';
import { MusicThemes } from './kernel/Registry.js';

// --- Logique
const game = new Game();
const profile = new Profile(new LocalStorage());
const shop = new Shop(profile, game.bus);

// --- Rendu (l'ordre compte : RunnerView met à jour ctx.focus pour les suivants)
const world = new World();
game.on('zone', ({ zone }) => world.setPalette(zone.palette));
const ctx = { game, world, focus: new THREE.Vector3(), skin: profile.data.skin };
const views = [
  new BeatFx(ctx),      // en premier : fournit ctx.fx et ctx.beatMaterials
  new TrackView(ctx),
  new WorldDecorView(ctx),
  new DioramaView(ctx),
  new TunnelView(ctx),
  new SiteDecorView(ctx), // monde généré depuis un site
  new SideLightShow(ctx),
  new EntityViews(ctx),
  // (RivalView ajoutée plus bas, une fois le multijoueur créé)
  new RunnerView(ctx),
  new ChaserView(ctx),
  new Particles(ctx),
  new CameraRig(ctx),
];

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
let site = null; // monde généré en cours : { spec, theme }

// --- Multijoueur (WebRTC pair-à-pair, sans serveur)
const mp = new Multiplayer(game, profile);
views.splice(views.findIndex((v) => v instanceof RunnerView), 0, new RivalView(ctx, mp));

function play() {
  sfx.init(); // l'audio ne peut démarrer qu'après une action du joueur
  if (lyria.hasKey() && !lyria.ready && lyria.status !== 'connecting') lyria.connect();
  if (mp.inRoom) { // en multi, seul l'hôte lance (revanche = nouvelle course)
    if (mp.isHost) mp.startRace(site?.spec ?? null);
    return;
  }
  menus.show(null);
  game.start(shop.prepareRun(site ? { theme: site.theme } : {}));
}

function enterSite(spec) {
  const { zone, theme } = installSite(spec);
  registerSiteModels(spec);
  activateSite(zone);
  site = { spec, theme };
}
function exitSite() { site = null; restoreWorlds(); }

// --- Killer feature : n'importe quel site devient un monde
new SitePanel({
  menus, lyria,
  onReady(spec) { enterSite(spec); play(); },
  onImage: (spec, id) => setSiteImage(spec, id),
  onExit() { exitSite(); menus.show('start'); },
});

const lobby = new Lobby({ mp, menus, hud, onLaunch: () => play() });
mp.on('start', ({ seed, delay, world }) => {
  sfx.init();
  if (world) enterSite(world); else if (site) exitSite();
  menus.show(null);
  lobby.countdown(delay, () => game.start({ ...shop.prepareRun(site ? { theme: site.theme } : {}), seed }));
});
document.getElementById('shoveBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); input.shove(); });
game.on('mp:shove', ({ hit }) => sfx.tone(hit ? 180 : 420, 0.18, 'square', 0.15, hit ? -80 : -200));
game.on('mp:bump', () => sfx.tone(140, 0.08, 'triangle', 0.18, -60));
game.on('runner:knocked', ({ lateral }) => views.find((v) => v instanceof CameraRig)?.addShake(Math.min(1, Math.abs(lateral) / 30)));

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
  mp.finish(result);
  setTimeout(() => {
    menus.showGameOver(result, record);
    if (mp.inRace) document.getElementById('overDetails').insertAdjacentHTML('beforeend', lobby.resultsHtml() + (mp.isHost ? '' : '<p class="small">L\'hôte peut relancer une revanche.</p>'));
  }, 700);
});

// --- Boucle
let last = performance.now(), time = 0;
hud.setTitle('Dino Escape');

function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000);
  last = now;
  time += dt;
  input.enabled = !menus.panelOpen;
  const intent = input.read(dt);
  game.update(dt, intent);
  mp.update(dt, intent);
  lobby.update();
  for (const v of views) v.update(dt, time);
  music.update(dt);
  hud.update(dt);
  world.update(dt, ctx.focus);
  world.render(ctx.fx?.pulse ?? 0, game.worldJump ? Math.sin(game.worldJump.progress * Math.PI) : game.runner.boost > 0 ? .8 : 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug depuis la console : __dino.game.runner, __dino.profile.earn(1000)…
window.__dino = { game, profile, shop, lyria, music, mp };
