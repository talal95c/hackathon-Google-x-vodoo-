import { MusicThemes } from '../kernel/Registry.js';

// Thèmes musicaux pour Lyria RealTime (et le synthé de secours).
//
// Lyria répond mieux à des TAGS courts séparés par des virgules (genre, instruments,
// ambiance) qu'à de longues phrases. Chaque thème a :
//   core   → identité du morceau, envoyée en permanence (garde la cohérence)
//   levels → énergie croissante, mélangée au core ; suit les paliers de tempo du jeu (GAME.tempoLevels)
//   bpm    → tempo au palier 0 ; multiplié par le ratio du palier (le dino accélère d'autant)
//   scale  → tonalité fixe (enchaînements harmonieux)
//   vocals → tags de voix, utilisés en mode voix (VOCALIZATION) ; sinon "Instrumental" est ajouté
//   density / brightness → plages parcourues en continu avec l'intensité
// consumable : true = acheté à l'unité, consommé au lancement d'une partie.
MusicThemes.define('techno', {
  name: 'Techno', price: 0, consumable: false,
  core: 'Techno, Melodic Techno, TR-909 Drum Machine, 303 Acid Bass, Retro 8-bit Arpeggios, Driving, Hypnotic, Tight Groove, Video Game Chase Soundtrack',
  vocals: 'Ethereal Female Vocal Chops, Hypnotic Chanted Vocals, Rave Vocals',
  levels: [
    'Sparse, Filtered Kick, Ambient Pads, Subtle Build-up, Mysterious',
    'Four-on-the-floor Kick, Rolling Bassline, Crisp Hi-hats, Groovy, Danceable',
    'Peak Time, Acid Squelches, Rave Stabs, Energetic, Euphoric Synth Lead',
    'Massive Drop, Hard Techno, Pounding Kick, Intense, Huge Energy, Climax',
  ],
  bpm: 124, scale: 'A_FLAT_MAJOR_F_MINOR',
  density: [0.35, 0.95], brightness: [0.45, 0.9],
  synth: { wave: 'sawtooth', scale: [0, 3, 5, 7, 10], root: 41 },
});

MusicThemes.define('reggae', {
  name: 'Reggae', price: 80, consumable: true,
  core: 'Reggae, Dub, One Drop Drums, Offbeat Skank Guitar, Deep Round Bass, Hammond Organ, Sunny, Warm',
  vocals: 'Soulful Reggae Vocals, Warm Harmonies, Call and Response',
  levels: [
    'Laid Back, Minimal, Dub Echoes, Relaxed Groove',
    'Steppers Rhythm, Horn Section, Uplifting, Bouncy',
    'Dancehall Riddim, Punchy Drums, Energetic, Dub Sirens',
    'Heavy Dub Steppers, Massive Sub Bass, Spacey Delays, Intense, Festival Energy',
  ],
  bpm: 84, scale: 'G_MAJOR_E_MINOR',
  density: [0.3, 0.8], brightness: [0.45, 0.75],
  synth: { wave: 'triangle', scale: [0, 2, 4, 7, 9], root: 43 },
});

MusicThemes.define('rap', {
  name: 'Rap', price: 80, consumable: true,
  core: 'Hip Hop, Boom Bap, Dusty Drums, Vinyl Crackle, Deep Bass, Head Nodding Groove',
  vocals: 'Rap Vocals, Hype Ad-libs, Confident Flow',
  levels: [
    'Lo-fi, Chill, Jazzy Piano, Mellow',
    'Hard Hitting Drums, Dark Piano Loop, Confident',
    'Trap, 808 Bass, Rapid Hi-hat Rolls, Aggressive, Hype',
    'Drill, Sliding 808s, Menacing Strings, Intense, Epic',
  ],
  bpm: 90, scale: 'E_FLAT_MAJOR_C_MINOR',
  density: [0.35, 0.9], brightness: [0.35, 0.7],
  synth: { wave: 'square', scale: [0, 3, 5, 7, 10], root: 36 },
});

MusicThemes.define('chiptune', {
  name: '8-bit', price: 60, consumable: true,
  core: 'Chiptune, 8-bit, NES Video Game Music, Square Wave Lead, Retro Arcade, Catchy Melody',
  vocals: 'Robotic Vocoder Vocals, Cute Vocal Chops',
  levels: [
    'Cheerful, Simple Arpeggios, Light Percussion, Playful',
    'Upbeat Adventure Theme, Driving Bassline, Bouncy',
    'Boss Battle, Fast Arpeggios, Heroic Melody, Tense',
    'Final Boss, Blazing Fast Arpeggios, Frantic, Maximum Energy',
  ],
  bpm: 128, scale: 'C_MAJOR_A_MINOR',
  density: [0.45, 1], brightness: [0.6, 1],
  synth: { wave: 'square', scale: [0, 4, 7, 11, 12], root: 57 },
});

MusicThemes.define('metal', {
  name: 'Metal', price: 100, consumable: true,
  core: 'Heavy Metal, Distorted Electric Guitars, Palm-muted Riffs, Powerful Drums, Bass Guitar, Epic',
  vocals: 'Powerful Rock Vocals, Epic Choir',
  levels: [
    'Heavy Groove, Chugging Riffs, Steady Drums, Brooding',
    'Galloping Riffs, Double Kick Drums, Driving, Aggressive',
    'Thrash Metal, Fast Tremolo Picking, Shredding Guitar Solo, Intense',
    'Speed Metal, Blast Beats, Relentless Double Bass, Epic Climax',
  ],
  bpm: 120, scale: 'G_MAJOR_E_MINOR',
  density: [0.6, 1], brightness: [0.5, 0.9],
  synth: { wave: 'sawtooth', scale: [0, 1, 5, 7, 8], root: 40 },
});
