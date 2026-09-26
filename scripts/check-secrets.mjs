// Garde-fou avant publication : échoue si une clé du .env se retrouve dans dist/.
import fs from 'fs';
import path from 'path';
if (!fs.existsSync('.env')) process.exit(0);
const secrets = fs.readFileSync('.env', 'utf8').split('\n')
  .map((l) => l.match(/^(\w*(?:KEY|SECRET|CREDENTIAL|TOKEN)\w*)=(.{8,})$/)).filter(Boolean)
  .map(([, name, value]) => ({ name, value: value.trim() }));
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk('dist');
let leak = false;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const s of secrets) if (text.includes(s.value)) { console.error(`✗ ${s.name} trouvée dans ${f}`); leak = true; }
}
if (leak) { console.error('Publication bloquée : une clé secrète est dans le build.'); process.exit(1); }
console.log(`✓ aucune clé du .env dans dist/ (${secrets.length} vérifiée(s), ${files.length} fichiers)`);
