// Voix des skins : quand un dino lance une claque, il balance une réplique (en anglais)
// générée À L'AVANCE par Gemini TTS (npm run voices:gen → public/voices/). Le jeu est ultra dynamique : répliques d'1 à 3 mots, criées en moins d'une seconde. Chaque skin a sa voix pré-entraînée (voiceName), son style de jeu
// (directive en langage naturel comprise par le modèle) et son propre inventaire de répliques,
// tous coordonnés avec le type de skin (Vador = seigneur noir, Mario = plombier, reggae = cool…).
// Un skin sans profil ici parle avec la voix « classic ».
export const VOICES = {
  classic: { // le dino de Chrome : voix de robot hors-ligne
    voiceName: 'Iapetus',
    style: 'Say in a flat, deadpan, slightly robotic retro computer voice, short and punchy',
    lines: ['Not found!', 'Beep boop!', 'Offline!', 'Reboot!', 'Bye!'],
  },
  reggae: {
    voiceName: 'Umbriel',
    style: 'Say in a laid-back, sunny reggae vibe with a light Jamaican accent, chill but cheeky',
    lines: ['Easy, mon!', 'Irie!', 'One shove!', 'Riddim!', 'Bless up!'],
  },
  vader: {
    voiceName: 'Algenib',
    style: 'Say in a deep, slow, menacing voice with heavy mechanical breathing, like a dark lord',
    lines: ['Join me.', 'Weak.', 'Kneel!', 'Disturbing.', 'Darkness!'],
  },
  drift: {
    voiceName: 'Laomedeia',
    style: 'Say in an energetic, cocky young gamer voice, hyped like a battle royale streamer',
    lines: ['Bounced!', 'GG!', 'Noob!', 'Bye bye!', 'Ez!'],
  },
  mario: {
    voiceName: 'Puck',
    style: 'Say in a cheerful, bouncy voice with a playful Italian plumber accent',
    lines: ['Mamma mia!', 'Wahoo!', "Let's-a go!", 'Bye bye!', 'Yahoo!'],
  },
  alligator: {
    voiceName: 'Enceladus',
    style: 'Say in a raspy, hissing swamp creature voice, stretching the s sounds, sly and hungry',
    lines: ['Snap!', 'Chomp!', 'Gotcha!', 'Ssswamp!', 'Bite!'],
  },
  neon: {
    voiceName: 'Fenrir',
    style: 'Say in an electric, glitchy, high-energy synthwave announcer voice',
    lines: ['Zap!', 'Voltage!', 'Toast!', 'Glow!', 'Bzzt!'],
  },
  gold: {
    voiceName: 'Alnilam',
    style: 'Say in a posh, pompous, rich aristocrat voice, smug and theatrical',
    lines: ['Peasant.', 'Cha-ching!', 'Bling!', 'Too rich.', 'Pardon me.'],
  },
};

export function voiceFor(skinId) { return VOICES[skinId] || VOICES.classic; }

// Texte envoyé au modèle : la directive de style puis la réplique
export function voicePrompt(voice, line) { return `${voice.style}. Shout it as one very fast, short burst, no pause: ${line}`; }

// Une réplique au hasard, jamais deux fois la même d'affilée
export function pickLine(voice, last = null, rand = Math.random) {
  const pool = voice.lines.length > 1 ? voice.lines.filter((l) => l !== last) : voice.lines;
  return pool[Math.floor(rand() * pool.length)];
}
