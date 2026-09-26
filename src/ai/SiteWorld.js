import { Entities, MusicThemes } from '../kernel/Registry.js';
import { Obstacle, MovingEnemy } from '../entities/Enemy.js';
import { ZONES } from '../content/zones.js';

// Transforme la description d'un site (WorldGenerator) en contenu jouable, sans toucher au kernel :
// types d'entités, zone (palette + table d'apparitions) et thème musical Lyria.
// La partie "site" remplace les 5 mondes par ce monde unique et infini.
const DEFAULT_ZONES = [...ZONES];

// Comportement choisi par l'IA → classe + collision (réglés pour être justes)
const BEHAVIOR = {
  jump: { class: Obstacle, hitbox: { hx: 1.8, hz: 0.5, top: 1.6 }, hp: 1, reward: 3 },
  dodge: { class: Obstacle, hitbox: { hx: 2, hz: 0.4, top: Infinity }, hp: 2, reward: 3 },
  charge: { class: MovingEnemy, hitbox: { hx: 1.5, hz: 0.6, top: Infinity }, hp: 1, reward: 5, motion: { roll: 15, wake: 85 } },
  zigzag: { class: MovingEnemy, hitbox: { hx: 1.6, hz: 0.5, top: Infinity }, hp: 2, reward: 4, motion: { lateral: 2.5, freq: 1.4 } },
};
const WEIGHT = { jump: 2.2, dodge: 2, charge: 1.6, zigzag: 1.6 };

export const siteKey = (spec) => `site_${spec.host.replace(/[^a-z0-9]+/gi, '_')}`;
export const entityType = (spec, o) => `${siteKey(spec)}:${o.id}`;

const lighten = (c, k) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k);
};

// Enregistre (une seule fois par site) et renvoie { zone, theme }
export function installSite(spec) {
  const key = siteKey(spec);
  for (const o of spec.obstacles) {
    const type = entityType(spec, o);
    const b = BEHAVIOR[o.behavior];
    if (!Entities.has(type)) Entities.define(type, { ...b, hitbox: { ...b.hitbox }, motion: b.motion && { ...b.motion }, label: o.label, site: key });
  }
  if (!MusicThemes.has(key)) {
    MusicThemes.define(key, {
      name: spec.name, price: 0, consumable: false, site: true,
      core: spec.music.core, levels: spec.music.levels, vocals: spec.music.vocals, bpm: spec.music.bpm,
      density: [0.7, 1], brightness: [0.6, 0.95],
      synth: { wave: 'sawtooth', scale: [0, 3, 5, 7, 10], root: 43 },
    });
  }
  const p = spec.palette;
  const zone = {
    id: key, site: spec, name: spec.name, subtitle: spec.subtitle,
    palette: { sky: p.sky, skyTop: p.skyTop, cloud: lighten(p.sky, 0.6), sun: 0xffffff, road: p.road, edge: p.edge, dash: p.accent, text: p.text },
    decor: 'site',
    spawns: [
      ...spec.obstacles.map((o) => ({ type: entityType(spec, o), weight: WEIGHT[o.behavior] })),
      { pattern: 'coinRow', weight: 2 }, { pattern: 'coinSnake', weight: 1.2 },
      { type: 'boostPad', weight: 0.8 }, { type: 'laserPickup', weight: 0.3, minDistance: 300 },
      { type: 'shieldPickup', weight: 0.25, minDistance: 300 }, { type: 'magnetPickup', weight: 0.2 },
    ],
    boss: null,
  };
  return { zone, theme: key };
}

// Remplace les mondes par le site (modification en place : tous les modules voient le changement)
export function activateSite(zone) { ZONES.splice(0, ZONES.length, zone); }
export function restoreWorlds() { ZONES.splice(0, ZONES.length, ...DEFAULT_ZONES); }
export const siteActive = () => !!ZONES[0]?.site;
