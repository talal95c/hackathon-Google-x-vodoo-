// Génère les voix des personnages avec Gradium (https://docs.gradium.ai).
//   GRADIUM_API_KEY=... npm run voices            → crée les voix manquantes puis les répliques manquantes/modifiées
//   GRADIUM_API_KEY=... npm run voices -- --redesign reggae   → nouvelle voix pour ce personnage
// Sorties : scripts/voices/voices.json (voice_id par personnage), public/voices/**.mp3 + manifest.json.
// Nécessite ffmpeg (wav → mp3 mono 64 kb/s, léger pour itch.io).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTERS } from './characters.js';

const API = 'https://api.gradium.ai/api';
const KEY = process.env.GRADIUM_API_KEY;
if (!KEY) { console.error('GRADIUM_API_KEY manquante'); process.exit(1); }

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const OUT = join(ROOT, 'public/voices');
const VOICES_FILE = join(HERE, 'voices.json');
const MANIFEST_FILE = join(OUT, 'manifest.json');
const CONCURRENCY = 2; // limite de sessions simultanées Gradium
const TTS_CONFIG = { temp: 0.8, cfg_coef: 2.2, padding_bonus: -0.8 };

const redesign = new Set(process.argv.includes('--redesign') ? process.argv.slice(process.argv.indexOf('--redesign') + 1) : []);
const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', body } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'x-api-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res;
    const busy = res.status === 400 && (await res.clone().text()).includes('Concurrency limit');
    if ((busy || res.status === 429 || res.status >= 500) && attempt < 6) { await sleep(1500 * (attempt + 1)); continue; }
    throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  }
}

// Voice Design : décrit le personnage, prend le premier candidat et le convertit en voix permanente
async function designVoice(id, char) {
  const { embeddings } = await (await api('/voice-generator/generate', {
    method: 'POST', body: { prompt: char.prompt, language: 'fr', n_samples: 1 },
  })).json();
  const embeddingId = embeddings[0].embedding_id;
  for (let i = 0; i < 60; i++) {
    const { embeddings: found } = await (await api(`/voice-generator/embeddings?embedding_id=${embeddingId}`)).json();
    if (found[0]?.ready) break;
    await sleep(2000);
  }
  const voice = await (await api('/voices/from-embedding', {
    method: 'POST', body: { voxium_embedding_id: embeddingId, name: `Dino Escape · ${char.name}`, description: char.prompt.slice(0, 200) },
  })).json();
  console.log(`voix ${id} → ${voice.uid}`);
  return voice.uid;
}

async function tts(voiceId, text, file) {
  const res = await api('/post/speech/tts', {
    method: 'POST',
    body: { text, voice_id: voiceId, model_name: 'default', output_format: 'wav', only_audio: true, json_config: TTS_CONFIG },
  });
  const wav = `${file}.wav`;
  writeFileSync(wav, Buffer.from(await res.arrayBuffer()));
  // Coupe les silences de début/fin : la réplique doit tomber pile sur l'action
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav,
    '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',
    '-ac', '1', '-ar', '44100', '-b:a', '64k', file]);
  rmSync(wav);
}

const voices = readJson(VOICES_FILE, {});
for (const [id, char] of Object.entries(CHARACTERS)) {
  if (!voices[id] || redesign.has(id)) {
    voices[id] = await designVoice(id, char);
    writeFileSync(VOICES_FILE, `${JSON.stringify(voices, null, 2)}\n`);
  }
}

const previous = readJson(MANIFEST_FILE, { lines: {} });
const manifest = { voices, lines: {} };
const jobs = [];
for (const [id, char] of Object.entries(CHARACTERS)) {
  manifest.lines[id] = {};
  mkdirSync(join(OUT, id), { recursive: true });
  for (const [event, lines] of Object.entries(char.lines)) {
    manifest.lines[id][event] = lines.map((text, i) => {
      const file = `${id}/${event}_${i}.mp3`;
      const hash = createHash('sha1').update(`${voices[id]}|${JSON.stringify(TTS_CONFIG)}|${text}`).digest('hex').slice(0, 10);
      const old = previous.lines?.[id]?.[event]?.[i];
      if (!old || old.hash !== hash || !existsSync(join(OUT, file))) {
        rmSync(join(OUT, file), { force: true });
        jobs.push({ voiceId: voices[id], text, file });
      }
      return { file, text, hash };
    });
  }
}

// Manifest écrit d'avance : un fichier absent = réplique à (re)générer au prochain lancement
writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${jobs.length} réplique(s) à générer`);
let done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let job; (job = jobs.shift());) {
    await tts(job.voiceId, job.text, join(OUT, job.file));
    console.log(`[${++done}] ${job.file}  « ${job.text} »`);
  }
}));
console.log('terminé :', MANIFEST_FILE);
