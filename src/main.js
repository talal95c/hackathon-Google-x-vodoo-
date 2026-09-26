// Point d'assemblage : crée le kernel, branche les vues, le son, la musique et l'interface.
// C'est le seul fichier qui connaît tout le monde.
import * as THREE from 'three';

// Contenu (registres) puis modèles 3D associés
import './content/index.js';
import './view/models/entities.js';
import './view/models/decor.js';
import './view/models/blockDino.js';
import './view/models/reggaeDino.js';
import './view/models/costumeDinos.js';
import './view/models/weapons.js';

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
import { EntityViews } from './view/EntityViews.js';
import { RunnerView } from './view/RunnerView.js';
import { Particles } from './view/Particles.js';
import { CameraRig } from './view/CameraRig.js';
import { BeatFx } from './view/BeatFx.js';
import { AtmosphereFx } from './view/AtmosphereFx.js';
import { TransitionFx } from './view/TransitionFx.js';
import { PortalView } from './view/PortalView.js';
import { Input } from './input/Input.js';
import { Haptics, bindHaptics } from './input/Haptics.js';
import { Sfx, bindSfx } from './audio/Sfx.js';
import { SkinVoices, bindVoices } from './audio/SkinVoices.js';
import { LyriaEngine } from './audio/music/LyriaEngine.js';
import { SynthEngine } from './audio/music/SynthEngine.js';
import { MusicDirector } from './audio/music/MusicDirector.js';
import { Hud } from './ui/Hud.js';
import { boot } from './ui/Boot.js';
import { Menus } from './ui/Menus.js';
import { Multiplayer } from './net/Multiplayer.js';
import { Lobby } from './ui/Lobby.js';
import { RivalView } from './view/RivalView.js';
import { Bots } from './bots/Bots.js';
import { CombatView } from './view/CombatView.js';
import { CombatHud } from './ui/CombatHud.js';
import { FightClub } from './fight/FightClub.js';
import { FightClubView } from './view/FightClubView.js';
import { FightClubHud } from './ui/FightClubHud.js';
import { Skins } from './kernel/Registry.js';
import { MusicThemes } from './kernel/Registry.js';

// --- Logique
boot();

const game = new Game({ seed: (Math.random() * 2 ** 32) >>> 0 }); // le menu aussi change à chaque chargement
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
  new PortalView(ctx),   // vortex dans la porte de chaque monde
  new DioramaView(ctx),
  new TunnelView(ctx),
  new SideLightShow(ctx),
  new EntityViews(ctx),
  // (RivalView ajoutée plus bas, une fois le multijoueur créé)
  new RunnerView(ctx),
  new Particles(ctx),
  new AtmosphereFx(ctx), // particules d'ambiance par monde + traînées de vitesse
  new TransitionFx(ctx), // lignes de vitesse, flou, flash : fournit ctx.transition
  new CameraRig(ctx),
];

// --- Son et musique
const sfx = new Sfx();
bindSfx(game, sfx);
const haptics = new Haptics();
bindHaptics(game, haptics);
const lyria = new LyriaEngine();
const music = new MusicDirector(game, { lyria, synth: new SynthEngine() });
sfx.onInit = (audioCtx) => music.setAudioContext(audioCtx);
// Connexion Lyria dès le chargement (le WebSocket n'a pas besoin d'un clic) : musique live prête au 1er départ
if (lyria.hasKey()) lyria.connect();

// --- Interface
const hud = new Hud(game, profile);
const input = new Input();
// Indications tactiles ou clavier selon le dernier appareil utilisé
const setTouchUi = (on) => document.documentElement.classList.toggle('touch', on);
setTouchUi(matchMedia('(pointer: coarse)').matches);
addEventListener('touchstart', () => setTouchUi(true), { capture: true, passive: true });
addEventListener('keydown', () => setTouchUi(false), { capture: true, passive: true });
const voices = new SkinVoices({ sfx }); // répliques des skins à la claque (clips pré-générés dans public/voices/)
voices.preload();
const menus = new Menus({ game, profile, shop, lyria, music, voices, onPlay: play, onBack: back });
const hapticsToggle = document.getElementById('haptics');
hapticsToggle.checked = haptics.enabled;
document.getElementById('hapticsRow').classList.toggle('hidden', !haptics.supported);
hapticsToggle.addEventListener('change', () => { haptics.setEnabled(hapticsToggle.checked); haptics.pulse('tap'); });
document.addEventListener('click', (e) => { if (e.target.closest('button')) haptics.pulse('tap', { light: true }); });
let overAt = 0;

// --- Multijoueur (WebRTC pair-à-pair, sans serveur)
const mp = new Multiplayer(game, profile);
const bots = new Bots(game, 3); // PNJ du mode solo
views.splice(views.findIndex((v) => v instanceof RunnerView), 0, new RivalView(ctx, [mp, bots]));

function play() {
  sfx.init(); // l'audio ne peut démarrer qu'après une action du joueur
  if (lyria.hasKey() && !lyria.ready && lyria.status !== 'connecting') lyria.connect();
  if (mp.inRoom) { // en multi, seul l'hôte lance (revanche = nouvelle course)
    if (mp.isHost) mp.startRace();
    return;
  }
  menus.show(null);
  game.start({ ...shop.prepareRun(), respawn: true }); // solo aussi : une chute coûte une vie, on réapparaît
  bots.start(Skins.ids(), profile.data.skin); // solo : 3 dinos IA, tous différents (et différents du tien)
}

const lobby = new Lobby({ mp, bots, menus, hud, onLaunch: () => play() });
views.push(new CombatView(ctx, [mp, bots]), new CombatHud(ctx, () => lobby.race));
bindVoices(game, voices, { mp, bots });
const club = new FightClub(game, { mp, bots, profile });
const clubView = new FightClubView(ctx, club), clubHud = new FightClubHud(ctx, club);
game.on('club:open', () => { input.reset(); input.enabled = false; });
game.on('club:close', () => { input.reset(); views.find(v => v instanceof CameraRig).snap = true; });
game.on('club:cancel', ({ reason }) => hud.banner(reason, 2));

// Retour depuis l'écran de fin : le menu en solo, le salon en multijoueur
function back() {
  menus.show('start');
  if (mp.inRoom) lobby.open();
}
music.setRaceSource(() => lobby.race); // la musique réagit au match (rivaux proches, coups…)
game.on('bot:out', ({ bot }) => hud.banner(`💥 ${bot} is out!`, 1));
game.on('runner:respawn', ({ lives }) => hud.banner(`Back on track! ${'♥'.repeat(lives)}`, 1.2));
mp.on('start', ({ seed, delay, lane }) => {
  sfx.init();
  menus.show(null);
  bots.stop(); // en multijoueur : pas de PNJ
  lobby.countdown(delay, () => { game.start({ ...shop.prepareRun(), seed, respawn: true }); game.runner.x = lane; }); // multi : 3 vies, on réapparaît
});
document.getElementById('shoveBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); input.shove(); });


input.onAction((a) => {
  if (a !== 'confirm' || menus.panelOpen || club.active) return;
  if (game.state === 'menu') play();
  else if (game.state === 'over' && performance.now() - overAt > 900) { if (menus.screens.start.classList.contains('hidden')) back(); else play(); } // ESPACE : quitter l'écran de fin, puis relancer
});

game.on('game:start', ({ loadout }) => hud.setMusicLabel(`🎵 ${MusicThemes.get(loadout.theme).name}${lyria.ready ? ' · Lyria' : ''}`));
lyria.onStatus((status) => { if (status === 'playing') hud.setMusicLabel(`🎵 ${lyria.theme.name} · Lyria live`); });
game.on('game:over', (result) => {
  overAt = performance.now();
  const record = profile.recordRun(result);
  hud.setBest(record.best);
  mp.finish(result);
  setTimeout(() => {
    menus.showGameOver(result, record, { multiplayer: mp.inRoom });
    if (mp.inRace || bots.list.length) document.getElementById('overRace').innerHTML = lobby.resultsHtml() + (mp.inRace && !mp.isHost ? '<p class="small">The host can start a rematch.</p>' : '');
  }, 700);
});

// --- Boucle
let last = performance.now(), time = 0;
hud.setTitle('Dino Race Fight Club');

function frame(now) {
  const wallDt = (now - last) / 1000;
  const dt = Math.min(1 / 20, wallDt);
  last = now;
  time += dt;
  club.update();
  input.enabled = !menus.panelOpen && !club.active;
  const intent = input.read(dt);
  game.update(dt, intent, wallDt);
  mp.update(dt, intent);
  bots.update(dt, intent);
  lobby.update();
  for (const v of views) v.update(dt, time);
  music.update(dt);
  hud.update(dt);
  world.update(dt, ctx.focus);
  world.adapt(wallDt);
  clubView.update(dt, time);
  clubHud.update();
  world.render(club.active ? clubView.hitKick : (ctx.fx?.pulse ?? 0), club.active ? clubView.postFx : ctx.transition);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug depuis la console : __dino.game.runner, __dino.profile.earn(1000)…
window.__dino = { game, profile, shop, lyria, music, voices, mp, menus, lobby, bots };
