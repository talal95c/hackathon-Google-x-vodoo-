// Détourage d'une image générée sur fond uni (fond vert "chroma key") → sprite transparent recadré.
// Remplissage depuis les bords (le vert à l'intérieur du sujet est conservé), bord adouci et
// suppression du reflet vert. Code pur sur un tableau RGBA : utilisé dans le navigateur et sous Node.
export function cutout(rgba, w, h, { tolerance = 110 } = {}) {
  // couleur de fond = moyenne des pixels du bord
  let r = 0, g = 0, b = 0, n = 0;
  const sample = (x, y) => { const i = (y * w + x) * 4; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++; };
  for (let x = 0; x < w; x += 4) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += 4) { sample(0, y); sample(w - 1, y); }
  const key = [r / n, g / n, b / n];
  const dist = (i) => Math.hypot(rgba[i] - key[0], rgba[i + 1] - key[1], rgba[i + 2] - key[2]);

  // remplissage depuis tous les bords
  const bg = new Uint8Array(w * h), queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (p) => { if (!bg[p] && dist(p * 4) < tolerance) { bg[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }

  // alpha + bord adouci + suppression du reflet de la couleur de fond
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const greenKey = key[1] > key[0] && key[1] > key[2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    if (bg[p]) { rgba[i + 3] = 0; continue; }
    const edge = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (y > 0 && bg[p - w]) || (y < h - 1 && bg[p + w]);
    if (edge) {
      const d = dist(i);
      rgba[i + 3] = Math.round(255 * Math.min(1, Math.max(0.25, (d - tolerance * 0.5) / tolerance)));
      if (greenKey) rgba[i + 1] = Math.min(rgba[i + 1], Math.max(rgba[i], rgba[i + 2]) + 20);
    }
    if (rgba[i + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h, empty: true };
  const pad = 2;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, removed: tail / (w * h) };
}

export const SPRITE_STYLE = 'Cute bold video game character sprite, single subject, full body, thick white sticker outline, flat cel-shaded colors, centered, isolated on a pure solid #00FF00 green background, no shadow, no text, no frame';
