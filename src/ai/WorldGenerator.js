import { SPRITE_STYLE } from "./cutout.js";
// Transforme un site web en monde jouable, avec les modèles Google (via @google/genai) :
//   1. Gemini lit la page (outil urlContext) et invente un monde : nom, palette, obstacles
//      inspirés du contenu du site, textes de panneaux, prompts musicaux pour Lyria.
//   2. Gemini Image dessine une texture par obstacle et les panneaux publicitaires.
// Fonctionne dans le navigateur ET sous Node (script de pré-génération) : aucune dépendance au DOM.
export const TEXT_MODEL = 'gemini-3.8-flash';            // le plus récent ; réflexion basse ≈ 5 s
export const TEXT_THINKING = { thinkingLevel: 'LOW' };
export const IMAGE_MODEL = 'gemini-3.1-flash-lite-image'; // génération 3.1 ; ≈ 2,5 s par image (vs 9 s)
const TIMEOUT_TEXT = 25000, TIMEOUT_IMAGE = 30000;
export const BEHAVIORS = ['jump', 'dodge', 'charge', 'zigzag'];

const PROMPT = (url) => `Tu es le game designer de "Dino Escape", un runner 3D : le dinosaure de la page
"Pas de connexion" de Chrome s'échappe du navigateur en courant à travers les sites web.
Lis ce site : ${url}
Invente le monde "${url}" que le dino traverse. Tout doit évoquer CE site précisément (ses couleurs,
ses rubriques, ses objets, ses mèmes, ses éléments d'interface) de façon drôle et reconnaissable.

Réponds UNIQUEMENT avec un objet JSON (pas de markdown) :
{
  "name": "NOM DU MONDE en majuscules, 2 à 4 mots, en français",
  "subtitle": "une phrase courte et drôle affichée à l'entrée (français)",
  "palette": { "sky": "#hex horizon", "skyTop": "#hex haut du ciel", "road": "#hex route (clair ou foncé, lisible)",
               "edge": "#hex bordures (couleur signature du site)", "accent": "#hex seconde couleur", "text": "#hex texte du HUD lisible sur le ciel" },
  "obstacles": [ 4 éléments {
      "id": "slug_court",
      "label": "nom affiché, 1 à 3 mots, 20 caractères max, français",
      "behavior": "jump" (bas, on saute dessus) | "dodge" (haut, on l'esquive) | "charge" (fonce vers le joueur) | "zigzag" (glisse de gauche à droite),
      "color": "#hex",
      "image": "description anglaise d'un PERSONNAGE cartoon expressif incarnant cet élément du site, avec une émotion et des petites jambes ou des bras (ex. 'a furious blue thumbs up with tiny legs')"
  } ] — utilise au moins 3 comportements différents, dont un "charge",
  "billboards": [ 3 slogans parodiques très courts (max 4 mots, français) détournant le site ],
  "billboardImage": "description en anglais d'une affiche publicitaire parodique du site, style flat design",
  "music": {
    "core": "tags anglais séparés par des virgules : genre + instruments + ambiance collant au site, très entraînant et rapide",
    "levels": [ 4 chaînes de tags anglais d'énergie croissante (0 = déjà groovy, 3 = climax) ],
    "vocals": "tags anglais de voix",
    "bpm": nombre entre 120 et 145
  }
}`;

const hex = (v, fallback) => (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim()) ? parseInt(v.trim().replace('#', ''), 16) : fallback);
const clip = (s, n, fallback = '') => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : fallback);
const slug = (s, i) => (clip(s, 24, `obj${i}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `obj${i}`);

export function hostOf(url) {
  try { return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ''); }
  catch { return url.replace(/^https?:\/\//, '').split('/')[0]; }
}

// Réponse du modèle → spec valide (valeurs de secours pour tout champ manquant ou invalide)
export function normalizeSpec(raw, url) {
  const host = hostOf(url);
  const p = raw.palette || {};
  const obstacles = (Array.isArray(raw.obstacles) ? raw.obstacles : []).slice(0, 4).map((o, i) => ({
    id: slug(o.id || o.label, i),
    label: clip(o.label, 28, `Obstacle ${i + 1}`),
    behavior: BEHAVIORS.includes(o.behavior) ? o.behavior : BEHAVIORS[i % BEHAVIORS.length],
    color: hex(o.color, 0x888888),
    image: clip(o.image, 300, `${o.label || 'object'} from the website ${host}`),
  }));
  while (obstacles.length < 3) obstacles.push({ id: `obj${obstacles.length}`, label: 'Pop-up', behavior: BEHAVIORS[obstacles.length], color: 0x888888, image: `a browser pop-up window from ${host}` });
  if (!obstacles.some((o) => o.behavior === 'charge')) obstacles[obstacles.length - 1].behavior = 'charge';
  const m = raw.music || {};
  const levels = (Array.isArray(m.levels) ? m.levels : []).map((l) => clip(l, 200)).filter(Boolean);
  while (levels.length < 4) levels.push(['Upbeat, Groovy, Catchy Riff', 'Driving, Energetic, Rising Lead', 'Peak Time, Euphoric Hook', 'Massive Drop, Maximum Energy'][levels.length]);
  return {
    version: 1,
    url, host,
    name: clip(raw.name, 32, host.toUpperCase()).toUpperCase(),
    subtitle: clip(raw.subtitle, 90, `Échappe-toi de ${host} !`),
    palette: {
      sky: hex(p.sky, 0xdfe8f0), skyTop: hex(p.skyTop, 0x5f86b5), road: hex(p.road, 0xeeeeee),
      edge: hex(p.edge, 0x1a73e8), accent: hex(p.accent, 0xff4f8b), text: clip(p.text, 9, '#222222'),
    },
    obstacles,
    billboards: (Array.isArray(raw.billboards) ? raw.billboards : []).map((b) => clip(b, 30)).filter(Boolean).slice(0, 3),
    billboardImage: clip(raw.billboardImage, 300, `a parody flat design advertisement poster for ${host}`),
    music: {
      core: clip(m.core, 300, 'Uptempo Electro House, Punchy Kick, Catchy Synth Hook, Energetic, Danceable'),
      levels: levels.slice(0, 4),
      vocals: clip(m.vocals, 160, 'Catchy Vocal Chops'),
      bpm: Math.max(115, Math.min(150, Math.round(+m.bpm || 132))),
    },
  };
}

function parseJson(text) {
  const t = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  return JSON.parse(t.slice(a, b + 1));
}

const withTimeout = (promise, ms, what) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} : délai dépassé`)), ms)),
]);

export class WorldGenerator {
  constructor(ai) { this.ai = ai; } // instance de GoogleGenAI

  // Étape 1 (bloquante, ~5 s) : le site → la description du monde
  async spec(url) {
    const res = await withTimeout(this.ai.models.generateContent({
      model: TEXT_MODEL,
      contents: PROMPT(url),
      config: { tools: [{ urlContext: {} }], temperature: 1, thinkingConfig: TEXT_THINKING },
    }), TIMEOUT_TEXT, 'Lecture du site');
    return normalizeSpec(parseJson(res.text), url);
  }

  // Étape 2 (en parallèle, pendant que le joueur court) : les textures.
  // onImage(clé, dataURL) : clé = id d'obstacle ou 'billboard'. Les échecs sont ignorés (texture de secours).
  images(spec, onImage) {
    const jobs = [
      ...spec.obstacles.map((o) => [o.id, `${o.image}. ${SPRITE_STYLE}.`]), // détouré ensuite (cutout.js)
      ['billboard', `${spec.billboardImage}. Wide flat design poster, bold colors, big shapes, no small text.`],
    ];
    return Promise.all(jobs.map(([key, prompt]) => this.#image(prompt)
      .catch(() => this.#image(prompt)) // une seconde tentative (échec ponctuel du modèle)
      .then((img) => onImage(key, img))
      .catch((e) => console.warn(`[WorldGenerator] image ${key}`, e?.message))));
  }

  async #image(prompt) {
    const res = await withTimeout(
      this.ai.models.generateContent({ model: IMAGE_MODEL, contents: prompt, config: { responseModalities: ['IMAGE'] } }),
      TIMEOUT_IMAGE, 'Image');
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) throw new Error('pas d\'image');
    return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
  }
}
