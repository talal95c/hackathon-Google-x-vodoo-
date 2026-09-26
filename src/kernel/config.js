// Tous les réglages de gameplay au même endroit.

// Physique du dino (le "game feel")
export const RUNNER = {
  baseSpeed: 34,         // vitesse de course au palier de tempo 0 (m/s), × GAME.tempoLevels[i].ratio ensuite
  startSpeed: 26,        // départ lancé
  accel: 3,              // réactivité vers la vitesse cible
  latSpeed: 13,          // vitesse latérale max (+ 12 % de la vitesse)
  latResponse: 16,       // nervosité du latéral (plus haut = plus sec)
  airControl: 0.55,      // contrôle latéral en l'air
  centrifugal: 0.12,     // poussée vers l'extérieur des virages (∝ v² × courbure)
  driftCentrifugal: 0.4, // fraction de poussée conservée en glissade
  // Virages durs : le virage "aspire" vers l'extérieur à vitesse constante (prévisible) :
  // il faut MAINTENIR la direction du virage ; si on lâche, on sort.
  hardPull: 0.85,        // aspiration = 85 % de la vitesse latérale max (on tient en maintenant la touche)
  hardPullDrift: 0.5,    // en glissant, aspiration réduite de moitié
  hardSlowdown: 0.85,    // le dino ralentit un peu dans le virage (plus de temps pour réagir)
  boostSpeed: 18,        // vitesse ajoutée pendant le sprint
  driftChargeRate: 0.9,  // charge du sprint par seconde de glissade
  slideDrain: 0.85,      // jauge de glissade vidée par seconde (pleine ≈ 1,2 s de glissade)
  slideRegen: 0.3,       // jauge rechargée par seconde hors glissade (≈ 3,3 s pour la remplir)
  slideMin: 0.15,        // jauge minimale pour commencer une glissade
  jumpVel: 13.5,         // impulsion de saut
  gravity: 38,
  fallGravity: 1.7,      // multiplicateur en redescente (saut plus sec)
  coyote: 0.1,           // on peut encore sauter 0.1 s après avoir quitté le sol
  jumpBuffer: 0.12,      // un appui juste avant l'atterrissage est gardé
  slopeEffect: 22,       // montée = plus lent, descente = plus rapide
  stumbleTime: 0.35,     // durée du trébuchement après un choc
  hitSpeedFactor: 0.65,  // vitesse conservée après un choc
  invulAfterHit: 1.1,
  radius: 0.85,          // demi-largeur du dino pour les collisions
  height: 3.2,           // hauteur du dino pour les collisions
  // Stats modifiables par skins / effets / améliorations (voir Stats.js)
  magnetRange: 0,        // rayon d'attraction des pièces
  coinMultiplier: 1,
  weaponDuration: 1,     // multiplicateur de durée des armes
  maxLives: 3,
};

// Règles de la partie
export const GAME = {
  // Paliers de vitesse : la vitesse du dino est multipliée par ratio dès le palier atteint.
  // La musique suit (tempo × ratio) avec une transition DJ, en décalé : le jeu ne l'attend jamais.
  tempoLevels: [
    { at: 0, ratio: 1 },
    { at: 450, ratio: 1.1 },
    { at: 1100, ratio: 1.2 },
    { at: 1900, ratio: 1.3 },
    { at: 2900, ratio: 1.4 },
  ],
  fixedDt: 1 / 120,      // pas de simulation fixe (physique déterministe)
  maxSubSteps: 8,
  difficultyDistance: 5000,
  chaserStartGap: 45,    // avance au départ sur le curseur (m)
  chaserMaxGap: 55,      // le curseur ne se laisse jamais distancer au-delà
  chaserSpeedFactor: 0.93,
  fallDuration: 1.3,     // durée de la chute avant l'écran de fin (tomber = game over)
  coinValue: 25,
  startS: 5,
  parryWindow: 0.14,
  parryCooldown: 0.5,
  feverDuration: 6,
};

// Génération de la route
export const TRACK = {
  step: 2,               // un échantillon tous les 2 m
  chunkSamples: 60,      // un morceau = 120 m (unité de spawn / de maillage)
  aheadDistance: 520,    // on génère jusqu'à s + 520
  behindDistance: 160,   // on supprime ce qui est derrière s - 160
  startStraight: 110,    // départ droit et plat
  maxHeading: 1.35,      // cap max (rad) : la route avance toujours, jamais de croisement
  radiusEasy: 30,        // rayon mini au début…
  radiusHard: 14,        // …et en fin de difficulté (épingles)
  radiusMax: 70,
  slopeEasy: 0.1,
  slopeHard: 0.22,
  heightLimit: 35,
  width: 16,             // largeur au départ (m)
  widthMin: 12,          // largeur mini (la route se rétrécit avec la distance)
  curveWidening: 90,     // la route s'élargit dans les virages serrés
  // Virages durs (rares, annoncés par des chevrons) : il faut freiner ou glisser
  hardTurnFrom: 300,     // pas avant 300 m
  hardTurnSpacing: 250,  // au moins 250 m entre deux
  hardTurnChance: 0.14,  // probabilité à chaque nouvel arc (+ 0.1 avec la difficulté)
  hardTurnRadius: [10, 12],
  hardTurnAngle: [1.3, 1.9], // rad (75° → 110°)
  zoneLength: 720,       // 6 morceaux : un nouveau monde environ toutes les 20 secondes
};

// Rythme des apparitions et des boss
export const DIRECTOR = {
  firstSpawn: 120,       // rien avant 120 m (échauffement)
  gapEasy: 30,           // espace moyen entre deux "événements" au début…
  gapHard: 18,           // …et à pleine difficulté
  bossStart: 700,        // le boss apparaît à 700 m dans la zone…
  // …et l'arène dure jusqu'à la fin de la zone (500 m) : s'il est encore en vie, il s'enfuit
  arenaWeaponEvery: 90,  // une arme garantie tous les 90 m dans l'arène
  itemRowEvery: 170,     // Royale : une rangée de boîtes « ? » tous les 170 m
};

// Course Royale (multijoueur) : 2 à 5 dinos, le dernier est éliminé à intervalles réguliers.
export const ROYALE = {
  minPlayers: 2,
  maxPlayers: 5,
  endTime: 135,          // la dernière élimination tombe à 2:15, quel que soit le nombre de joueurs
  interval: 20,          // secondes entre deux éliminations
  firstMin: 30,          // jamais d'élimination avant 30 s
  warning: 5,            // alerte "tu es dernier" avant l'élimination
  countdown: 3,
  width: { start: 16, min: 10, per: 650 }, // la route se resserre (m de largeur perdus tous les `per` m)
  respawnDelay: 1.6,     // chute → retour sur la route (pas d'élimination)
  respawnSpeed: 0.55,
  respawnInvul: 1.5,
  snapshotRate: 20,
  shove: { cooldown: 1.2, dash: 11, impulse: 26, reach: 4, range: 4.2, ringOutWindow: 3 },
  bump: { radius: 1.9, length: 2.2, strength: 9 },
  slipstream: { min: 2, range: 14, lateral: 1.6, charge: 1.1, boost: 0.9 },
  coinSpeed: 0.012,      // +1,2 % de vitesse de croisière par pièce…
  coinMax: 10,           // …jusqu'à 10 pièces
  coinLoss: 3,           // pièces perdues quand on est touché
  trickBoost: 0.6,
  rocket: { window: 0.35, boost: 1.8, stallBefore: 1, stallSpeed: 0.3 },
  combo: {
    window: 4,           // secondes pour enchaîner avant que le combo retombe
    maxLevel: 5,
    boostPerLevel: 0.35, // chaque palier donne un sprint de 0,35 s × palier
    shovePerLevel: 0.12, // +12 % de puissance de poussée par palier
    itemAt: 3,           // palier 3 : objet offert si l'emplacement est vide
    rageAt: 5,           // palier 5 : mode RAGE (vitesse + poussée ×1,6)
  },
};
