# Architecture de Dino Escape

Le jeu est découpé en **couches**. Le principe clé : le **kernel** contient toute la logique
et ne connaît ni Three.js ni le DOM. Les **vues** lisent son état et écoutent ses événements
pour dessiner, jouer des sons, afficher le HUD. On peut donc travailler sur les modèles 3D,
les animations ou la musique **sans jamais toucher au gameplay**, et inversement.

```
            ┌──────────── content/ (données : zones, ennemis, armes, skins, musiques, boutique)
            ▼
 input/ ─▶ kernel/ ──événements──▶ view/  (Three.js : route, entités, dino, caméra, particules)
 (intent)  Game                  ├▶ audio/ (bruitages + musique Lyria / synthé)
           Runner, Track,        └▶ ui/    (HUD, menus, boutique)
           Director, Chaser
            ▲
 meta/ ─────┘ (profil, portefeuille, boutique → "loadout" de la partie)
```

`src/main.js` est le seul fichier qui assemble tout.

## Dossiers

| Dossier | Contenu | Dépend de Three.js ? |
|---|---|---|
| `kernel/` | `Game` (états, vies, score, boucle à pas fixe), `Runner` (physique du dino), `Track` (route procédurale), `Director` (spawns, boss), `Chaser`, `Stats`, `Registry`, `EventBus`, `Random`, `config` | **non** |
| `entities/` | `Entity` → `Collectable` (`CoinPickup`, `WeaponPickup`, `EffectPickup`, `BoostPad`), `Enemy` (`Obstacle`, `MovingEnemy`), `Boss`, `Projectile` | non |
| `weapons/` | `Weapon` → `LaserWeapon`, `ShieldWeapon` ; `StatusEffect` (bonus temporaires) | non |
| `meta/` | `Profile` (sauvegarde), `Shop` (achats + loadout), `Storage` | non |
| `content/` | les définitions de contenu (un fichier par famille) + `index.js` | non |
| `view/` | `World`, `CameraRig`, `TrackView`, `EntityViews`, `RunnerView`, `ChaserView`, `Particles`, `ModelRegistry`, `models/` | oui |
| `audio/` | `Sfx` + `bindSfx`, `music/` (`LyriaEngine`, `SynthEngine`, `MusicDirector`) | non |
| `ui/` | `Hud`, `Menus`, `style.css` | non (DOM) |
| `input/` | `Input` (clavier AZERTY/QWERTY + tactile → intent) | non |

## Coordonnées

Tout le gameplay se fait en **coordonnées piste** :
- `s` : distance le long de la route (m)
- `d` : décalage latéral, **+ = gauche**
- `y` : hauteur au-dessus de la route

`track.frame(s)` renvoie le repère monde de la route en `s` (`x, y, z, th` = cap, `slope`, `w` = largeur,
`lx, lz` = vecteur gauche). `track.point(s, d, h)` donne un point monde.

## Événements du kernel

S'abonner : `game.on('type', (payload) => …)`, ou `game.on('*', (type, payload) => …)` pour tout recevoir.

| Événement | Payload |
|---|---|
| `state` | `{ state, prev }` : `menu`, `playing`, `falling`, `over` |
| `game:start` / `game:over` | `{ loadout, seed }` / `{ reason: 'fall'\|'dead'\|'caught', distance, coins, score, zone }` |
| `zone` | `{ index, number, zone }` |
| `tempo` | `{ level, ratio }` : nouveau palier de vitesse |
| `chunk:add` / `chunk:remove` | morceau de route `{ index, i0, i1, s0, s1, zone }` |
| `entity:spawn` | l'entité |
| `entity:destroy` | `{ entity, reason: 'collected'\|'killed'\|'smashed'\|'hit'\|'despawn'\|'escaped'\|'expired' }` |
| `enemy:damage` | `{ entity, amount, hp }` |
| `runner:jump` · `runner:step` · `runner:air` · `runner:fall` | — |
| `runner:land` | `{ impact }` (0 → 1) |
| `runner:drift` | `{ on }` |
| `runner:boost` | `{ seconds, source: 'drift'\|'pad', big }` |
| `runner:hit` | `{ source }` |
| `life:lost` | `{ reason, lives }` (chocs uniquement : une chute = game over direct) |
| `coins` | `{ amount, total }` |
| `beat` | `{ index, bar, downbeat }` : à chaque temps de la musique (effets visuels uniquement) |
| `pad:used` | `{ entity }` |
| `weapon:equip` / `weapon:fire` / `weapon:expire` | `{ weapon }` |
| `effect:add` / `effect:expire` | `{ effect }` |
| `boss:start` · `boss:phase` · `boss:attack` · `boss:damage` · `boss:defeated` · `boss:escaped` | `{ boss, … }` |
| `shop:purchase` | `{ item, price }` |

## Recettes

### Ajouter un obstacle
```js
// content/enemies.js
Entities.define('firewall', { class: Obstacle, hitbox: { hx: 2, hz: 0.5, top: 1.5 }, hp: 3, reward: 5 });
```
`hitbox.top` bas (< 2.6) : on peut sauter par-dessus. `top: Infinity` : il faut esquiver.
Ensuite, ajoute-le à la table `spawns` d'une zone (`content/zones.js`) et donne-lui un modèle (voir plus bas).

### Un ennemi avec un comportement
```js
class Bouncer extends MovingEnemy {
  update(dt) { super.update(dt); this.y = Math.abs(Math.sin(this.t * 3)) * 2; }
  onDeath() { this.game.spawn('coin', this.s, this.d); }
}
Entities.define('bouncer', { class: Bouncer, hitbox: { hx: 1, hz: 1, top: 2 }, hp: 1, reward: 3 });
```

### Un boss
Aucun boss n'est actif pour l'instant (`boss: null` dans les zones), mais le moteur les gère :
```js
Entities.define('firewallBoss', {
  class: Boss, name: 'FIREWALL', hitbox: { hx: 3.5, hz: 1.5, top: 6 }, hp: 60, reward: 150,
  distance: 30, height: 4, sway: 3.5, projectile: 'firewallShot',
  phases: [{ below: 1, attackEvery: 1.6, pattern: 'aimed' }, { below: 0.5, attackEvery: 1.4, pattern: 'spread' }],
});
Entities.define('firewallShot', { class: Projectile, hitbox: { hx: 1, hz: 0.6, top: 2.2 }, life: 4 });
// puis dans content/zones.js : boss: 'firewallBoss', bossWeapons: ['laserPickup']
```
Pour de nouvelles attaques, sous-classe `Boss` et surcharge `attack(pattern)`.
Le Director le lance à `DIRECTOR.bossStart` mètres dans la zone, avec des armes garanties dans l'arène.

### Une arme
```js
class FreezeWeapon extends Weapon {
  update(dt) { super.update(dt); for (const e of this.game.entities) if (e.kind === 'enemy') e.frozen = true; }
  onExpire() { for (const e of this.game.entities) e.frozen = false; }
}
Weapons.define('freeze', { class: FreezeWeapon, name: 'Gel', duration: 5 });
Entities.define('freezePickup', { class: WeaponPickup, hitbox: { hx: 1.2, hz: 1.2, top: 3.5 }, weapon: 'freeze' });
```
Propriétés lues par le kernel : `smashes` (détruit au contact) et `grantsInvulnerability`.

### Un bonus temporaire (stat)
```js
Effects.define('slowmo', { name: 'Ralenti', duration: 6, modifiers: { mul: { baseSpeed: 0.8, maxBaseSpeed: 0.8 } } });
```
Toutes les clés de `RUNNER` (dans `kernel/config.js`) sont modifiables : `(base + Σ add) × Π mul`.

### Un skin
```js
Skins.define('pirate', { name: 'Pirate', price: 800, rarity: 'rare', view: { model: 'blockDino', color: 0x6d4c41 } });
```
Il apparaît automatiquement dans la boutique. Pour un vrai modèle 3D :
```js
// view/models/pirate.js (importé dans main.js)
Models.register('pirateDino', gltfModel('models/pirate.glb', {
  scale: 0.8, clips: { run: 'Run', jump: 'Jump', slide: 'Slide', stumble: 'Hit', fall: 'Fall', idle: 'Idle' },
}));
// content/skins.js → view: { model: 'pirateDino' }
```
Les fichiers `.glb` vont dans `public/models/`.

### Un modèle 3D pour une entité
```js
Models.register('cactus', gltfModel('models/cactus.glb', { scale: 1.2 }));
// ou à la main :
Models.register('cactus', ({ entity }) => ({ object: monGroupe, update(e, dt, t) { … } }));
```
`EntityViews` place et oriente le modèle sur la route. Le modèle ne gère que son apparence et ses animations.
Si un type n'a pas de modèle, il s'affiche en cube magenta (avec un avertissement dans la console).

Le modèle du dino reçoit une **pose** calculée par `RunnerView` :
`{ state: 'idle'|'run'|'jump'|'slide'|'stumble'|'fall', speed, gait, steer, grounded, vy, boost, driftCharge }`,
et les événements `runner:*` via `onEvent(type, payload)`.

### Un thème musical (Lyria)
```js
MusicThemes.define('jazz', {
  name: 'Jazz', price: 80, consumable: true,
  levels: ['Smooth jazz trio, brushed drums…', 'Upbeat swing…', 'Fast bebop…', 'Frantic big band finale…'],
  bpm: [90, 180], density: [0.4, 0.9], brightness: [0.4, 0.8],
  synth: { wave: 'triangle', scale: [0, 2, 3, 5, 7, 9, 10], root: 45 },
});
```
`levels` : un prompt par palier d'intensité. Le `MusicDirector` calcule l'intensité à partir de la vitesse,
de la progression, du danger et des boss. Lyria change de palier au plus toutes les 6 s ; le BPM
s'applique à ce moment-là (`resetContext`), ce qui produit un effet de « drop ».

### Une amélioration de boutique
```js
ShopItems.define('upgrade:jump', {
  category: 'upgrade', name: 'Super saut', desc: '+8 % par niveau', maxLevel: 3,
  price: (lvl) => 300 * (lvl + 1),
  modifiers: (lvl) => ({ mul: { jumpVel: 1 + 0.08 * lvl } }),
});
```

### Une zone
Ajoute une entrée dans `content/zones.js` : `palette`, `decor` (clé `decor:<nom>` du registre de modèles),
`spawns` (table pondérée, avec `minDistance` optionnel) et `boss`.

## Rythme et musique
- **Le gameplay ne dépend jamais de la musique** : aucune latence audio ne peut gêner le joueur.
  Les paliers de vitesse (`GAME.tempoLevels`) s'appliquent dès la distance atteinte (événement `tempo`).
- La musique **suit** : `MusicDirector` passe le palier à Lyria (tempo du thème × ratio) avec une transition
  DJ calée sur les mesures (filtre doux + fondu enchaîné). Le synthé de secours accélère progressivement.
- **L'environnement pulse au rythme** : `game.beat` (`kernel/BeatClock.js`) est recalé sur la musique
  réelle (le `BeatTracker` analyse le PCM de Lyria avant lecture). `BeatFx` fait pulser les bordures
  de route, le curseur et, légèrement, la caméra (`ctx.fx.pulse` / `ctx.fx.down`).
- Latence audio : réglage « Synchro musique ↔ jeu » dans le menu Musique (`music.offsetMs`).

## Règles
1. **Le kernel ne dépend pas de Three.js ni du DOM** : `npm test` le fait tourner sous Node.
2. **Les vues ne modifient jamais l'état du kernel** : elles lisent et elles écoutent.
3. **Le hasard du gameplay passe par `game.rng`** (graine) : même graine = même partie
   (utile pour un défi du jour ou des ghosts). Le décor purement visuel peut utiliser `Math.random`.
4. **Nouveau contenu = un fichier dans `content/`, plus une ligne dans `content/index.js`.**

## Clé API Lyria
La musique Lyria a besoin d'une clé Gemini. Elle est **saisie par le joueur** dans le menu Musique
et stockée seulement dans son navigateur. `VITE_GEMINI_API_KEY` (fichier `.env`) n'est lu **qu'en dev** :
un build public ne doit jamais contenir de clé. Sans clé, `SynthEngine` joue une musique procédurale
qui suit aussi le tempo du jeu.
