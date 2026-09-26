// Zones traversées par le dino. Chaque zone = une couche du navigateur.
//   palette   → lue par les vues (ciel, route, bordures, HUD)
//   spawns    → table de spawn pondérée lue par le Director
//   boss      → boss de fin de zone (null = pas de boss ; voir entities/Boss.js pour en créer un)
export const ZONES = [
  {
    id: 'offline', name: 'OFFLINE DESERT', subtitle: 'Leave the no-connection page.',
    palette: { sky: 0xd5b5a5, skyTop: 0x718baf, cloud: 0xf4dfc3, sun: 0xffdfad, road: 0xe1b58b, edge: 0x725a4c, dash: 0xf3dbad, text: '#535353' },
    decor: 'clouds',
    spawns: [
      { type: 'cactus', weight: 3 },
      { type: 'cactusBig', weight: 1.5 },
      { pattern: 'coinRow', weight: 2.5 },
      { type: 'boostPad', weight: 0.8 },
      { type: 'magnetPickup', weight: 0.25, minDistance: 300 },
      { type: 'shieldPickup', weight: 0.2, minDistance: 400 },
    ],
    boss: null,
  },
  {
    id: 'browser', name: 'BROWSER', subtitle: 'Dodge the tabs and pop-ups.',
    palette: { sky: 0xc4b4cf, skyTop: 0x6d86ab, cloud: 0xf1dccb, sun: 0xffe6c6, road: 0xd3bcd5, edge: 0x73629c, dash: 0xffffff, text: '#1a3d7c' },
    decor: 'windows',
    spawns: [
      { type: 'popup', weight: 2 },
      { type: 'popupSlider', weight: 1.5 },
      { type: 'tabWall', weight: 1.5 },
      { pattern: 'coinRow', weight: 1.5 },
      { pattern: 'coinSnake', weight: 1 },
      { type: 'boostPad', weight: 0.8 },
      { type: 'laserPickup', weight: 0.3 },
      { type: 'doubleCoinsPickup', weight: 0.25 },
      { type: 'shieldPickup', weight: 0.25 },
    ],
    boss: null,
  },
  {
    id: 'windows', name: 'WINDOWS', subtitle: 'Cross the system desktop.',
    palette: { sky: 0xb4cfd7, skyTop: 0x587fac, cloud: 0xe7ece5, sun: 0xffedcf, road: 0xbbd4d3, edge: 0x0078d4, dash: 0xffffff, text: '#164c7d' },
    decor: 'desktop',
    spawns: [{ type: 'popup', weight: 2 }, { type: 'tabWall', weight: 1 }, { type: 'popupSlider', weight: 1 }, { pattern: 'coinSnake', weight: 2 }, { type: 'shieldPickup', weight: .35 }], boss: null,
  },
  {
    id: 'hardware', name: 'HARDWARE', subtitle: 'Dive into the heart of the machine.',
    palette: { clouds: false, sky: 0x143834, skyTop: 0x071c22, cloud: 0x23594d, sun: 0xccfff1, road: 0x16433b, edge: 0x34e9b4, dash: 0xd4b36b, text: '#bdffed' },
    decor: 'circuits',
    spawns: [{ type: 'tabWall', weight: 1.5 }, { type: 'popupSlider', weight: 2 }, { pattern: 'coinRow', weight: 2 }, { type: 'boostPad', weight: 1 }, { type: 'laserPickup', weight: .35 }], boss: null,
  },
  {
    id: 'cloud', name: 'CLOUD', subtitle: 'Free at last. How far will you go?',
    palette: { sky: 0xe8f7ff, skyTop: 0x70bce9, cloud: 0xffffff, sun: 0xfff6df, road: 0xf0f8fc, edge: 0x21bad0, dash: 0xaedee8, text: '#126476' },
    decor: 'cloud',
    spawns: [{ type: 'popup', weight: 1 }, { type: 'rollingCookie', weight: 1 }, { pattern: 'coinSnake', weight: 3 }, { type: 'boostPad', weight: 1 }, { type: 'doubleCoinsPickup', weight: .4 }], boss: null,
  },
];
