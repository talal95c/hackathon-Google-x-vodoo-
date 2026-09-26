import { WorldGenerator, hostOf } from '../ai/WorldGenerator.js';
import { listCached, loadCached, saveCached, shrink, loadBuiltinIndex, loadBuiltin } from '../ai/siteCache.js';

// Écran "Cours sur n'importe quel site" : URL → monde généré par l'IA → partie.
// La partie démarre dès que le monde est inventé (~5 s) ; les images arrivent pendant qu'on court.
const $ = (id) => document.getElementById(id);

export class SitePanel {
  #ai = null;
  busy = false;

  // onReady(spec) : lance la partie sur ce monde ; onImage(spec, id, dataURL) : texture reçue ; onExit() : mondes classiques
  constructor({ menus, lyria, onReady, onImage, onExit }) {
    Object.assign(this, { menus, lyria, onReady, onImage, onExit });
    this.el = $('sitePanel');
    menus.panels.site = this.el; // géré comme les autres panneaux (fermeture, clavier désactivé)
    this.builtin = [];
    loadBuiltinIndex().then((list) => { this.builtin = list; this.render(); });

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-site]');
      if (!b) return;
      const a = b.dataset.site;
      if (a === 'open') this.open();
      else if (a === 'go') this.generate($('siteUrl').value);
      else if (a === 'classic') { this.menus.closePanels(); this.onExit(); }
      else if (a === 'pick') this.pick(b.dataset.host, b.dataset.src);
    });
    $('siteUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.generate(e.target.value); });
  }

  open() { this.menus.open('site'); this.render(); setTimeout(() => $('siteUrl').focus(), 50); }

  render() {
    const cached = listCached();
    const chips = [
      ...cached.map((h) => `<button class="chip" data-site="pick" data-host="${h}" data-src="cache">🕘 ${h}</button>`),
      ...this.builtin.filter((b) => !cached.includes(b.host)).map((b) => `<button class="chip" data-site="pick" data-host="${b.host}" data-src="builtin">${b.emoji || '🌐'} ${b.host}</button>`),
    ];
    $('sitePresets').innerHTML = chips.join('') || '<span class="small">Aucun monde pour l\'instant : génère le premier !</span>';
    const hasKey = this.lyria.hasKey();
    $('siteGo').disabled = !hasKey || this.busy;
    $('siteHint').textContent = hasKey ? 'Gemini lit le site et invente ton monde en quelques secondes.' : 'Ajoute ta clé Gemini dans ♫ Musique pour générer n\'importe quel site. Les mondes ci-dessous sont jouables sans clé.';
  }

  #progress(label, p) {
    $('siteStatus').textContent = label;
    $('siteBar').style.width = `${Math.round(p * 100)}%`;
  }

  async pick(host, src) {
    const spec = src === 'cache' ? loadCached(host) : await loadBuiltin(host);
    if (!spec) return this.#progress('Monde introuvable', 0);
    this.menus.closePanels();
    this.onReady(spec);
  }

  async generate(input) {
    const url = (input || '').trim();
    if (!url || this.busy || !this.lyria.hasKey()) return;
    this.busy = true; this.render();
    const host = hostOf(url);
    $('siteAddress').textContent = `https://${host}`;
    let fake = 0.05;
    this.#progress(`Connexion à ${host}…`, fake);
    const tick = setInterval(() => { fake = Math.min(0.9, fake + 0.03); this.#progress(fake < 0.4 ? `Lecture de ${host}…` : 'Invention des obstacles et de la musique…', fake); }, 250);
    try {
      if (!this.#ai) { const { GoogleGenAI } = await import('@google/genai'); this.#ai = new GoogleGenAI({ apiKey: this.lyria.apiKey }); }
      const gen = new WorldGenerator(this.#ai);
      const spec = await gen.spec(/^https?:\/\//.test(url) ? url : `https://${url}`);
      clearInterval(tick);
      this.#progress('Monde prêt ! Les images arrivent pendant ta course…', 1);
      saveCached(spec);
      this.menus.closePanels();
      this.onReady(spec);
      // Textures en arrière-plan : réduites, appliquées en direct, mises en cache
      gen.images(spec, async (id, img) => {
        const small = await shrink(img);
        if (id === 'billboard') spec.billboardTexture = small;
        else { const o = spec.obstacles.find((x) => x.id === id); if (o) o.texture = small; }
        this.onImage(spec, id, small);
        saveCached(spec);
      });
    } catch (e) {
      clearInterval(tick);
      console.warn('[SitePanel]', e);
      this.#progress(`Impossible de générer ce site (${e.message?.slice(0, 80) || 'erreur'}). Essaie un autre ou un monde ci-dessous.`, 0);
    } finally {
      this.busy = false; this.render();
    }
  }
}
