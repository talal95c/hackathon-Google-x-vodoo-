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
  // Paliers de tempo : vitesse du dino ET tempo de la musique multipliés par ratio.
  // À chaque palier la musique change d'énergie (événement 'tempo').
  tempoLevels: [
    { at: 0, ratio: 1 },
    { at: 450, ratio: 1.1 },
    { at: 1100, ratio: 1.2 },
    { at: 1900, ratio: 1.3 },
    { at: 2900, ratio: 1.4 },
  ],
  // Le palier est d'abord DEMANDÉ ('tempo:request') ; la musique le confirme au moment du
  // drop (game.commitTempo()). Sans confirmation au bout de ce délai, il s'applique seul.
  tempoCommitTimeout: 8,
  fixedDt: 1 / 120,      // pas de simulation fixe (physique déterministe)
  maxSubSteps: 8,
  difficultyDistance: 5000,
  chaserStartGap: 45,    // avance au départ sur le curseur (m)
  chaserMaxGap: 55,      // le curseur ne se laisse jamais distancer au-delà
  chaserSpeedFactor: 0.93,
  fallDuration: 1.3,     // durée de la chute avant l'écran de fin (tomber = game over)
  coinValue: 25,
  startS: 5,
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
  width: 12,
  widthMin: 9,
  curveWidening: 90,     // la route s'élargit dans les virages serrés
  zoneLength: 1200,      // multiple de 120 (10 morceaux)
};

// Rythme des apparitions et des boss
export const DIRECTOR = {
  firstSpawn: 120,       // rien avant 120 m (échauffement)
  gapEasy: 30,           // espace moyen entre deux "événements" au début…
  gapHard: 18,           // …et à pleine difficulté
  bossStart: 700,        // le boss apparaît à 700 m dans la zone…
  // …et l'arène dure jusqu'à la fin de la zone (500 m) : s'il est encore en vie, il s'enfuit
  arenaWeaponEvery: 90,  // une arme garantie tous les 90 m dans l'arène
  // Rythme : les apparitions sont espacées en TEMPS musicaux puis "aimantées" sur les temps
  gapBeatsEasy: [3, 4, 4, 6],   // écarts possibles (en temps) au début…
  gapBeatsHard: [2, 2, 3, 4],   // …et à pleine difficulté
  snapWindow: [10, 90],         // on aimante les entités entre 10 et 90 m devant le dino
  snapRate: 6,                  // correction max (m/s) : invisible à l'œil
};
