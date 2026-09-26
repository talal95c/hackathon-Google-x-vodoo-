// Zones traversées par le dino. Chaque zone = une couche du navigateur.
//   palette   → lue par les vues (ciel, route, bordures, HUD)
//   spawns    → table de spawn pondérée lue par le Director
//   boss      → boss de fin de zone (null = pas de boss ; voir entities/Boss.js pour en créer un)
export const ZONES = [
  {
    name: 'HORS LIGNE',
    palette: { sky: 0xf4f4f4, skyTop: 0xdedede, cloud: 0xd6d6d6, sun: 0xffffff, road: 0xe2e2e2, edge: 0x535353, dash: 0xbdbdbd, text: '#535353' },
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
    name: 'ONGLETS',
    palette: { sky: 0xfde3c4, skyTop: 0x5f9cf5, cloud: 0xfff3e2, sun: 0xffe2b8, road: 0xf7f7f7, edge: 0x1a73e8, dash: 0xffffff, text: '#1a3d7c' },
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
    name: 'COOKIES & PUBS',
    palette: { sky: 0xff5fa2, skyTop: 0x1b0b3a, cloud: 0x7a3fb0, sun: 0xff9ad5, road: 0x2a2150, edge: 0xff4fa3, dash: 0xffffff, text: '#ffd1ea' },
    decor: 'ads',
    spawns: [
      { type: 'cookieBanner', weight: 2 },
      { type: 'rollingCookie', weight: 1.5 },
      { type: 'popupSlider', weight: 1.5 },
      { pattern: 'coinSnake', weight: 1.5 },
      { pattern: 'coinRow', weight: 1 },
      { type: 'boostPad', weight: 0.8 },
      { type: 'laserPickup', weight: 0.35 },
      { type: 'magnetPickup', weight: 0.3 },
      { type: 'shieldPickup', weight: 0.25 },
    ],
    boss: null,
  },
];
