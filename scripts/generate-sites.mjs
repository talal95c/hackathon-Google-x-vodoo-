// Pré-génère des mondes "site web" livrés avec le jeu (public/sites/), jouables sans clé API.
//   node scripts/generate-sites.mjs            → la liste par défaut
//   node scripts/generate-sites.mjs lemonde.fr → un site précis (ajouté à l'index)
// Clé lue dans .env (VITE_GEMINI_API_KEY) ; jamais écrite dans les fichiers générés.
import fs from 'fs';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { WorldGenerator, hostOf } from '../src/ai/WorldGenerator.js';

const DEFAULT = [
  ['youtube.com', '▶️'], ['wikipedia.org', '📚'], ['google.com', '🔍'], ['voodoo.io', '🎮'], ['deepmind.google', '🧠'],
  ['amazon.fr', '📦'], ['netflix.com', '🍿'], ['instagram.com', '📸'], ['reddit.com', '👽'], ['itch.io', '🕹️'],
];
const env = fs.readFileSync('.env', 'utf8').match(/VITE_GEMINI_API_KEY=(.+)/)?.[1]?.trim();
if (!env) throw new Error('VITE_GEMINI_API_KEY manquante dans .env');
const gen = new WorldGenerator(new GoogleGenAI({ apiKey: env }));
const OUT = 'public/sites';
fs.mkdirSync(OUT, { recursive: true });
const indexPath = `${OUT}/index.json`;
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];

const shrink = async (dataURL) => {
  const buf = Buffer.from(dataURL.split(',')[1], 'base64');
  const out = await sharp(buf).resize(256, 256, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString('base64')}`;
};

const targets = process.argv.slice(2).length ? process.argv.slice(2).map((h) => [h, '🌐']) : DEFAULT;
for (const [site, emoji] of targets) {
  const t0 = Date.now();
  try {
    const spec = await gen.spec(`https://${site}`);
    await gen.images(spec, async (id, img) => {
      const small = await shrink(img);
      if (id === 'billboard') spec.billboardTexture = small;
      else spec.obstacles.find((o) => o.id === id).texture = small;
    });
    const host = hostOf(site);
    fs.writeFileSync(`${OUT}/${host}.json`, JSON.stringify(spec));
    const i = index.findIndex((e) => e.host === host);
    const entry = { host, emoji, name: spec.name };
    i >= 0 ? (index[i] = entry) : index.push(entry);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 1));
    const images = spec.obstacles.filter((o) => o.texture).length + (spec.billboardTexture ? 1 : 0);
    console.log(`✓ ${host} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${images}/5 images, ${Math.round(fs.statSync(`${OUT}/${host}.json`).size / 1024)} Ko) : ${spec.name}`);
  } catch (e) {
    console.log(`✗ ${site} : ${e.message}`);
  }
}
