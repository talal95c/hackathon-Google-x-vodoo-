// Génère À L'AVANCE les voix des skins (Gemini TTS) dans public/voices/ : le jeu ne fait
// aucun appel API, les joueurs n'ont pas besoin de clé, zéro latence.
//   npm run voices:gen                → toutes les répliques manquantes (src/content/voices.js)
//   npm run voices:gen vader mario    → seulement ces skins
//   npm run voices:gen -- --force     → régénère même les clips déjà présents
// Clé Gemini : VITE_GEMINI_API_KEY dans .env (ou GEMINI_API_KEY). Sortie : mp3 mono 64 kb/s
// (via ffmpeg, sinon wav), plus public/voices/index.json lu par src/audio/SkinVoices.js.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import { VOICES, voicePrompt } from '../src/content/voices.js';

const MODEL = 'gemini-2.5-flash-preview-tts';
const MAX_SECONDS = 2.0;      // coupe dure (avec fondu) : le jeu est ultra dynamique
const OUT = 'public/voices';
const args = process.argv.slice(2), force = args.includes('--force');
const skins = args.filter((a) => !a.startsWith('--'));
const wanted = skins.length ? skins : Object.keys(VOICES);

const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const key = process.env.GEMINI_API_KEY || env.match(/^VITE_GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
const ffmpeg = hasFfmpeg();
const ext = ffmpeg ? 'mp3' : 'wav';
const manifestPath = path.join(OUT, 'index.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
let ai = null, generated = 0, failed = 0;

for (const skin of wanted) {
  const voice = VOICES[skin];
  if (!voice) { console.error(`Skin inconnu : ${skin}`); continue; }
  fs.mkdirSync(path.join(OUT, skin), { recursive: true });
  const entry = { voiceName: voice.voiceName, lines: [] };
  for (const [i, line] of voice.lines.entries()) {
    const file = `${skin}/${i}.${ext}`, full = path.join(OUT, file);
    const prev = manifest[skin]?.lines?.find((l) => l.text === line && fs.existsSync(path.join(OUT, l.file)));
    if (!force && prev) { entry.lines.push(prev); continue; }         // déjà généré pour ce texte
    if (!key) { console.error(`✗ ${skin} « ${line} » manquant et pas de clé Gemini (VITE_GEMINI_API_KEY)`); failed++; continue; }
    ai ??= new GoogleGenAI({ apiKey: key });
    process.stdout.write(`⏳ ${skin.padEnd(10)} « ${line} » `);
    try {
      const pcm = trim(await synthesize(ai, voice, line));
      const wavPath = full.replace(/\.\w+$/, '.wav');
      fs.writeFileSync(wavPath, wav(pcm));
      if (ffmpeg) { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-ac', '1', '-b:a', '64k', full]); fs.unlinkSync(wavPath); }
      entry.lines.push({ text: line, file, seconds: +pcm.seconds.toFixed(2) });
      generated++;
      console.log(`→ ${file}  ${pcm.seconds.toFixed(2)} s`);
    } catch (e) { failed++; console.log(`✗ ${e.message?.slice(0, 120)}`); }
  }
  manifest[skin] = entry;
  // fichiers orphelins (texte changé) : on nettoie
  for (const f of fs.readdirSync(path.join(OUT, skin))) if (!entry.lines.some((l) => l.file === `${skin}/${f}`)) fs.unlinkSync(path.join(OUT, skin, f));
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const total = Object.values(manifest).reduce((n, e) => n + e.lines.length, 0);
console.log(`\n✓ ${generated} clip(s) généré(s), ${failed} échec(s) · ${total} clips dans ${manifestPath}`);
if (failed) process.exit(1);

async function synthesize(ai, voice, line) {
  const res = await ai.models.generateContent({
    model: MODEL, contents: voicePrompt(voice, line),
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.voiceName } } } },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error('pas d\'audio dans la réponse');
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1]) || 24000;
  const buf = Buffer.from(part.inlineData.data, 'base64');
  return { rate, data: new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1) };
}

// Silences de début/fin coupés, durée plafonnée, court fondu de fin
function trim({ rate, data }) {
  let start = 0, end = data.length;
  while (start < end - rate * 0.1 && Math.abs(data[start]) < 200) start++;
  while (end > start + rate * 0.1 && Math.abs(data[end - 1]) < 200) end--;
  end = Math.min(end, start + Math.round(rate * MAX_SECONDS));
  const out = data.slice(start, end), fade = Math.min(out.length, Math.round(rate * 0.06));
  for (let i = out.length - fade; i < out.length; i++) out[i] = Math.round(out[i] * (out.length - i) / fade);
  return { rate, data: out, seconds: out.length / rate };
}

function wav({ rate, data }) {
  const h = Buffer.alloc(44), n = data.length * 2;
  h.write('RIFF', 0); h.writeUInt32LE(36 + n, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(n, 40);
  return Buffer.concat([h, Buffer.from(data.buffer, data.byteOffset, n)]);
}

function hasFfmpeg() { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } }
