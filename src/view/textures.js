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
