import * as THREE from 'three';

// Textures dessinées au canvas : zéro asset à charger, parfait pour itch.io.

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const popupTex = () => canvasTex(512, 320, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1a73e8'; g.fillRect(0, 0, w, 56);
  g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.fillText('Congratulations!', 18, 39);
  g.fillStyle = '#e53935'; g.fillRect(w - 56, 0, 56, 56);
  g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText('✕', w - 44, 43);
  g.fillStyle = '#222'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center';
  g.fillText('You have won', w / 2, 140);
  g.fillText('an iPhone 27!', w / 2, 190);
  g.fillStyle = '#34a853'; g.fillRect(w / 2 - 120, 220, 240, 64);
  g.fillStyle = '#fff'; g.font = 'bold 32px sans-serif'; g.fillText('CLAIM', w / 2, 264);
  g.strokeStyle = '#999'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
});

export const cookieTex = () => canvasTex(1024, 200, (g, w, h) => {
  g.fillStyle = '#fffbe8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#222'; g.font = 'bold 44px sans-serif';
  g.fillText('🍪 This site uses cookies', 30, 80);
  g.font = '30px sans-serif'; g.fillStyle = '#555';
  g.fillText('to improve your escape experience.', 30, 135);
  g.fillStyle = '#1a73e8'; g.fillRect(w - 290, 55, 250, 90);
  g.fillStyle = '#fff'; g.font = 'bold 38px sans-serif'; g.fillText('ACCEPT', w - 250, 115);
  g.strokeStyle = '#c9a227'; g.lineWidth = 10; g.strokeRect(0, 0, w, h);
});

export const tabTex = (label) => canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1a73e8'; g.beginPath(); g.arc(50, 64, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#333'; g.font = 'bold 40px sans-serif'; g.fillText(label, 90, 78);
  g.fillStyle = '#888'; g.font = 'bold 44px sans-serif'; g.fillText('✕', w - 60, 80);
});

export const loadingTex = () => {
  const t = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#0b57d0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8ab4f8';
    for (let x = -h; x < w; x += 40) {
      g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, h); g.lineTo(x + 20 + h, 0); g.lineTo(x + h, 0); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

export const adTex = (hue) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = `hsl(${hue},80%,55%)`; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center';
  const words = ['PROMO', '-90%', 'CLIQUEZ', 'GRATUIT', 'VPN', 'HOT'];
  g.fillText(words[hue % words.length], w / 2, 110);
  g.font = 'bold 30px sans-serif'; g.fillText('ICI ▶', w / 2, 180);
  g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
});

export const faviconTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#fbbc04'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 80px sans-serif'; g.textAlign = 'center'; g.fillText('★', 64, 92);
});

// Chevrons de virage (façon circuit), pointant à gauche ou à droite de l'écran
export const chevronTex = (left) => canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#e53935'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    const x = 70 + i * 120;
    g.beginPath();
    if (left) { g.moveTo(x - 40, h / 2); g.lineTo(x + 10, 14); g.lineTo(x + 40, 14); g.lineTo(x - 10, h / 2); g.lineTo(x + 40, h - 14); g.lineTo(x + 10, h - 14); }
    else { g.moveTo(x + 40, h / 2); g.lineTo(x - 10, 14); g.lineTo(x - 40, 14); g.lineTo(x + 10, h / 2); g.lineTo(x - 40, h - 14); g.lineTo(x - 10, h - 14); }
    g.fill();
  }
});

// --- Faces des obstacles (fond transparent, posées devant un volume arrondi)
const UI_FONT = '"Avenir Next", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

function drawCookie(g, x, y, r) {
  g.fillStyle = '#c98a4b'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e0a868'; g.beginPath(); g.arc(x - r * .18, y - r * .18, r * .72, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a2c1a';
  for (const [dx, dy, s] of [[-.35, -.3, .16], [.3, -.15, .13], [-.05, .35, .15], [.38, .38, .11], [-.45, .25, .1]]) {
    g.beginPath(); g.arc(x + dx * r, y + dy * r, s * r, 0, Math.PI * 2); g.fill();
  }
}

export const tabFaceTex = (label) => canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#1a73e8'; g.beginPath(); g.arc(110, h / 2, 42, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(110, h / 2, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#202124'; g.font = `800 76px ${UI_FONT}`; g.textBaseline = 'middle';
  g.fillText(label, 190, h / 2 + 4);
});

export const cookieFaceTex = () => canvasTex(1024, 208, (g, w, h) => {
  drawCookie(g, 92, h / 2, 56);
  g.textBaseline = 'middle';
  g.fillStyle = '#202124'; g.font = `800 50px ${UI_FONT}`; g.fillText('This site uses cookies', 180, 76);
  g.fillStyle = '#5f6368'; g.font = `600 32px ${UI_FONT}`; g.fillText('to improve your escape.', 180, 134);
});

export const acceptTex = () => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = '#1a73e8'; roundRect(g, 0, 0, w, h, 26); g.fill();
  g.fillStyle = '#ffffff'; g.font = `900 38px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ACCEPT', w / 2, h / 2 + 2);
});

export const popupFaceTex = () => canvasTex(512, 256, (g, w, h) => {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fbbc04'; g.font = `900 34px ${UI_FONT}`; g.fillText('★ CONGRATULATIONS ★', w / 2, 44);
  g.fillStyle = '#202124'; g.font = `900 46px ${UI_FONT}`;
  g.fillText('You have won', w / 2, 102); g.fillText('an iPhone 27!', w / 2, 152);
  g.fillStyle = '#34a853'; roundRect(g, w / 2 - 130, 186, 260, 58, 29); g.fill();
  g.fillStyle = '#ffffff'; g.font = `900 30px ${UI_FONT}`; g.fillText('CLAIM', w / 2, 216);
});

export const popupTitleTex = () => canvasTex(512, 64, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.font = `800 30px ${UI_FONT}`; g.textBaseline = 'middle';
  g.fillText('free-prize.exe', 22, h / 2 + 2);
});

// Bande danger jaune / noir (bas des barrières)
export const hazardTex = () => {
  const t = canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#202124'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fbbc04';
    for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
};

// Ombre de contact douce (disque radial)
export const shadowTex = () => canvasTex(128, 128, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(.55, 'rgba(0,0,0,.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
});

// Halo lumineux (blanc, teinté par le matériau)
export const glowTex = () => canvasTex(128, 128, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.35, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
});
