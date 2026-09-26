import { cutout } from './cutout.js';

// Navigateur : image générée (fond vert) → sprite détouré et recadré { src, aspect } (webp ou png).
const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

export async function toSprite(dataURL, size = 512) {
  const img = await load(dataURL);
  const k = Math.min(1, size / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const data = g.getImageData(0, 0, c.width, c.height);
  const box = cutout(data.data, c.width, c.height);
  g.putImageData(data, 0, 0);
  const out = document.createElement('canvas');
  out.width = box.w; out.height = box.h;
  out.getContext('2d').drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  let src = out.toDataURL('image/webp', 0.85);
  if (!src.startsWith('data:image/webp')) src = out.toDataURL('image/png'); // navigateurs sans encodeur webp
  return { src, aspect: box.w / box.h };
}
