// Brand packs: pure data -> registry/zone overrides. No DOM, no Three.js (testable in node).
export const DRAFT_KEY = 'dino-brand-draft';

const hex = (v) => (typeof v === 'string' ? parseInt(v.replace('#', ''), 16) : v);
const cssHex = (v) => (typeof v === 'number' ? `#${v.toString(16).padStart(6, '0')}` : v);

export const skinId = (pack) => `brand-${pack.id}`;
export const themeId = (pack) => `brand-${pack.id}`;
export const profileKey = (pack) => `dino-escape-profile:brand-${pack.id}`;

export function validatePack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object') return ['pack must be an object'];
  if (!/^[a-z0-9-]+$/.test(pack.id ?? '')) errors.push('id must be lowercase letters, digits or dashes');
  if (!pack.name) errors.push('name is required');
  if (pack.worlds && !Array.isArray(pack.worlds)) errors.push('worlds must be an array');
  return errors;
}

// Zone palettes: numeric colors for Three.js, CSS string for `text`.
export function zonePalette(palette = {}) {
  const out = {};
  for (const [k, v] of Object.entries(palette)) out[k] = k === 'text' ? cssHex(v) : typeof v === 'boolean' ? v : hex(v);
  return out;
}

export function applyContent(pack, { Skins, MusicThemes, zones }) {
  const errors = validatePack(pack);
  if (errors.length) throw new Error(`[brand] ${errors.join(', ')}`);
  const theme = themeId(pack), skin = skinId(pack);
  if (!MusicThemes.has(theme)) {
    const { id, ...base } = MusicThemes.get('techno');
    const m = pack.music ?? {};
    MusicThemes.define(theme, {
      ...base, name: m.name ?? `${pack.name} Mix`, price: 0, consumable: false,
      ...(m.core && { core: m.core }), ...(m.vocals && { vocals: m.vocals }),
      ...(Array.isArray(m.levels) && m.levels.length && { levels: m.levels }), ...(m.bpm && { bpm: m.bpm }),
    });
  }
  if (!Skins.has(skin)) {
    const s = pack.skin ?? {};
    Skins.define(skin, {
      name: s.name ?? pack.name, price: 0, rarity: 'epic', starter: true, theme,
      description: pack.tagline ?? '',
      view: { model: 'blockDino', color: hex(s.color ?? pack.palette?.primary ?? '#535353'), emissive: hex(s.emissive ?? '#000000'), eye: hex(s.eye ?? pack.palette?.accent ?? '#ffffff') },
    });
  }
  (pack.worlds ?? []).forEach((wld, i) => {
    const z = zones[i];
    if (!z || !wld) return;
    if (wld.name) z.name = wld.name;
    if (wld.subtitle) z.subtitle = wld.subtitle;
    if (wld.palette) z.palette = { ...z.palette, ...zonePalette(wld.palette) };
  });
  return { skin, theme, profileKey: profileKey(pack) };
}

// First visit of a brand game: equip the brand skin/music in the brand's own save slot.
export function seedProfile(storage, pack) {
  const key = profileKey(pack);
  if (storage.load(key, null)) return;
  storage.save(key, { skins: ['classic', 'reggae', skinId(pack)], skin: skinId(pack), theme: themeId(pack) });
}
