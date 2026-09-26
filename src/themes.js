// Chaque zone = une "couche" du navigateur que le dino traverse.
// Ajouter une zone : une entrée ici + les builders d'obstacles/décor dans track.js.
export const ZONES = [
  {
    name: 'HORS LIGNE',
    sky: 0xf4f4f4, skyTop: 0xdedede, cloud: 0xd6d6d6, sun: 0xffffff, road: 0xe2e2e2, edge: 0x535353, text: '#535353',
    obstacles: ['cactus', 'cactusBig'], decor: 'clouds',
  },
  {
    name: 'ONGLETS',
    // ciel d'après-midi façon "Summer Afternoon"
    sky: 0xfde3c4, skyTop: 0x5f9cf5, cloud: 0xfff3e2, sun: 0xffe2b8, road: 0xf7f7f7, edge: 0x1a73e8, text: '#1a3d7c',
    obstacles: ['popup', 'popup', 'tabWall'], decor: 'windows',
  },
  {
    name: 'COOKIES & PUBS',
    // synthwave néon façon "Horizon Drive"
    sky: 0xff5fa2, skyTop: 0x1b0b3a, cloud: 0x7a3fb0, sun: 0xff9ad5, road: 0x2a2150, edge: 0xff4fa3, text: '#ffd1ea',
    obstacles: ['cookieBanner', 'cookie', 'popup'], decor: 'ads',
  },
];

export const ZONE_LEN = 600; // mètres par zone (multiple de 120 = taille d'un morceau de route)
export const zoneNumber = (s) => Math.floor(Math.max(0, s) / ZONE_LEN);
export const zoneForS = (s) => zoneNumber(s) % ZONES.length;
