// Classe de base des vues : elles LISENT l'état du jeu et ÉCOUTENT ses événements,
// elles ne modifient jamais la logique.
//
//   class MaVue extends View {
//     constructor(ctx) { super(ctx); this.listen('runner:jump', () => ...); }
//     update(dt, time) { ... lire this.game.runner ... }
//   }
export class View {
  #offs = [];

  constructor(ctx) {
    this.ctx = ctx;
    this.game = ctx.game;
    this.track = ctx.game.track;
    this.world = ctx.world;
    this.scene = ctx.world?.scene;
  }

  listen(type, fn) { this.#offs.push(this.game.on(type, fn)); }

  update(dt, time) {}

  dispose() { for (const off of this.#offs) off(); this.#offs = []; }
}
