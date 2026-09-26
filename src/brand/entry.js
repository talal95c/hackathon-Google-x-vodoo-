// Branded game entry (brand.html). Same engine as the main game plus a brand pack overlay.
import markup from '../../index.html?raw';
import '../ui/style.css';
import './brand.css';
import '../content/index.js';
import { Skins, MusicThemes } from '../kernel/Registry.js';
import { ZONES } from '../content/zones.js';
import { LocalStorage } from '../meta/Storage.js';
import { applyContent, seedProfile, validatePack, DRAFT_KEY } from './pack.js';
import { registerBrandModels, billboardView } from './models.js';

const PACKS = Object.fromEntries(Object.values(import.meta.glob('./packs/*.json', { eager: true, import: 'default' })).map((p) => [p.id, p]));

function loadPack() {
  const id = new URLSearchParams(location.search).get('pack') ?? 'bnw';
  if (id === 'draft') {
    try { const draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); if (!validatePack(draft).length) return draft; } catch { /* invalid draft */ }
  }
  return PACKS[id] ?? PACKS.bnw;
}

function mountMarkup() {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  document.body.innerHTML = doc.body.innerHTML;
}

const lines = (s = '') => s.split('|').map((l) => l.replace(/[<>&]/g, '')).join('<br />');

function brandDom(pack) {
  const p = pack.palette ?? {};
  const root = document.documentElement.style;
  root.setProperty('--brand-primary', p.primary ?? '#143852');
  root.setProperty('--brand-accent', p.accent ?? '#ffcc40');
  root.setProperty('--brand-light', p.light ?? '#ffffff');
  document.body.classList.add('branded');
  const c = pack.copy ?? {};
  const $ = (sel) => document.querySelector(sel);
  const logo = pack.logo ? `<img class="brand-logo" src="${encodeURI(pack.logo)}" alt="" />` : '';
  $('#start .menu-brand').innerHTML = `${logo}<span>${lines(pack.name.toUpperCase())}</span><span class="edition">DINO ESCAPE · ÉDITION ${lines(pack.name.toUpperCase())}</span>`;
  const [a, b] = (c.title ?? `${pack.name}|ESCAPE.`).split('|');
  $('#start h1').innerHTML = `${lines(a)}<br /><span>${lines(b ?? '')}</span>`;
  $('#start .eyebrow').innerHTML = `<span class="live-dot"></span> ${lines((pack.tagline ?? '').toUpperCase())}`;
  if (c.hero) $('#start .hero-description').innerHTML = lines(c.hero);
  if (c.detail) $('#start .hero-detail').innerHTML = lines(c.detail);
  const reggae = $('#start .reggae-button');
  if (pack.url) {
    const cta = document.createElement('a');
    cta.className = 'brand-cta'; cta.href = pack.url; cta.target = '_blank'; cta.rel = 'noopener';
    cta.textContent = c.cta ?? `Découvrir ${pack.name}`;
    reggae.replaceWith(cta);
  } else reggae.remove();
  const badge = document.createElement('a');
  badge.className = 'brand-badge'; badge.href = pack.url ?? '#'; badge.target = '_blank'; badge.rel = 'noopener';
  badge.innerHTML = `${logo}<span>${lines(pack.tagline ?? pack.name)}</span>`;
  document.body.append(badge);
}

const pack = loadPack();
mountMarkup();
brandDom(pack);
const { profileKey } = applyContent(pack, { Skins, MusicThemes, zones: ZONES });
seedProfile(new LocalStorage(), pack);
const textures = registerBrandModels(pack);
globalThis.DINO_BRAND = { id: pack.id, title: `${pack.name} · Dino Escape`, profileKey, views: [billboardView(textures)] };
import('../main.js');
