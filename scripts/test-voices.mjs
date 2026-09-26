// Écoute les voix pré-générées (public/voices/) une par une, comme en jeu (macOS : afplay).
//   npm run voices              → tous les skins
//   npm run voices vader mario  → seulement ceux-là
// Génération : npm run voices:gen (scripts/gen-voices.mjs).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { VOICES } from '../src/content/voices.js';

const OUT = 'public/voices', TARGET = 1.0; // même accélération que src/audio/SkinVoices.js
const manifestPath = path.join(OUT, 'index.json');
if (!fs.existsSync(manifestPath)) { console.error('Aucune voix générée : lance d\'abord  npm run voices:gen'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const skins = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VOICES);

for (const skin of skins) {
  const voice = VOICES[skin], entry = manifest[skin];
  if (!voice) { console.error(`Skin inconnu : ${skin}`); continue; }
  console.log(`\n🦖 ${skin}  · voix ${voice.voiceName}\n   ${voice.style}`);
  if (!entry) { console.log('   (pas généré : npm run voices:gen ' + skin + ')'); continue; }
  for (const line of voice.lines) {
    const clip = entry.lines.find((l) => l.text === line);
    if (!clip) { console.log(`   ✗ « ${line} » pas généré (npm run voices:gen ${skin})`); continue; }
    const rate = Math.min(1.4, Math.max(1.1, (clip.seconds || TARGET) / TARGET));
    console.log(`   ▶ « ${line} »  ${clip.seconds} s → ${(clip.seconds / rate).toFixed(2)} s en jeu (×${rate.toFixed(2)})`);
    try { execFileSync('afplay', ['-r', String(rate), path.join(OUT, clip.file)]); } catch { console.log('   (afplay indisponible : ' + path.join(OUT, clip.file) + ')'); }
  }
}
console.log('\n✓ terminé');
