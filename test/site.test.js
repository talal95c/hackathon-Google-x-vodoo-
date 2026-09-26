// Monde généré depuis un site : robustesse face aux réponses de l'IA + intégration au kernel
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/index.js';
import { Game } from '../src/kernel/Game.js';
import { normalizeSpec } from '../src/ai/WorldGenerator.js';
import { installSite, activateSite, restoreWorlds, entityType } from '../src/ai/SiteWorld.js';
import { ZONES } from '../src/content/zones.js';
import { MusicThemes } from '../src/kernel/Registry.js';

const idle = { steer: 0, drift: false, brake: false, jump: false };

test('une réponse vide ou farfelue donne quand même un monde valide', () => {
  for (const raw of [{}, { obstacles: 'nope', palette: { sky: 'rouge' } }, { obstacles: [{ behavior: 'fly', label: 42 }] }]) {
    const s = normalizeSpec(raw, 'exemple.fr');
    assert.ok(s.name && s.subtitle);
    assert.ok(s.obstacles.length >= 3 && s.obstacles.every((o) => ['jump', 'dodge', 'charge', 'zigzag'].includes(o.behavior)));
    assert.ok(s.obstacles.some((o) => o.behavior === 'charge'), 'toujours un ennemi qui fonce');
    assert.equal(typeof s.palette.sky, 'number');
    assert.equal(s.music.levels.length, 4);
    assert.ok(s.music.bpm >= 115 && s.music.bpm <= 150);
  }
});

test('une partie sur un monde généré tourne et fait apparaître ses obstacles', () => {
  const spec = normalizeSpec({
    name: 'Le monde test', palette: { sky: '#112233', edge: '#ff0000' },
    obstacles: [
      { id: 'a', label: 'Pouce', behavior: 'jump' }, { id: 'b', label: 'Pub', behavior: 'charge' },
      { id: 'c', label: 'Trophée', behavior: 'dodge' }, { id: 'd', label: 'Roue', behavior: 'zigzag' },
    ],
    music: { core: 'Synthwave', bpm: 135 },
  }, 'https://www.youtube.com');
  const { zone, theme } = installSite(spec);
  installSite(spec); // idempotent : pas d'erreur de double définition
  activateSite(zone);
  try {
    assert.equal(ZONES.length, 1);
    assert.ok(MusicThemes.has(theme));
    const g = new Game({ seed: 3 });
    g.start({ seed: 3, theme });
    assert.equal(g.zone.site, spec);
    const seen = new Set();
    g.on('entity:spawn', (e) => seen.add(e.type));
    for (let t = 0; t < 30 && g.state === 'playing'; t += 1 / 60) { g.runner.invul = 99; g.update(1 / 60, { ...idle, steer: Math.max(-1, Math.min(1, (-g.runner.x * 3 - g.runner.push) / 6)) }); }
    for (const e of g.entities) seen.add(e.type);
    const siteTypes = spec.obstacles.map((o) => entityType(spec, o));
    assert.ok(siteTypes.filter((t) => seen.has(t)).length >= 3, `obstacles du site vus : ${[...seen].filter((t) => t.startsWith('site_')).join(', ')}`);
  } finally {
    restoreWorlds();
  }
  assert.equal(ZONES.length, 5, 'retour aux mondes classiques');
});
