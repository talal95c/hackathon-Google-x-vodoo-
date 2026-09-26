import { Collectable } from './Collectable.js';
import { Obstacle } from './Enemy.js';

// Boîte « ? » : le contenu est tiré par la course (RaceCore) selon la place du joueur.
export class ItemBox extends Collectable {
  collect() { this.game.emit('itembox:collect', { entity: this }); }
}

// Onglet piège posé par un rival (owner = id du joueur). Se saute ; le poseur ne le déclenche pas.
export class TrapTab extends Obstacle {
  onContact(runner) {
    if (this.owner && this.owner === this.game.playerId) return;
    if (runner.smashes) return this.destroy('smashed');
    if (runner.isInvulnerable) return;
    if (runner.hurt(this)) {
      this.game.emit('trap:hit', { entity: this, owner: this.owner });
      this.destroy('hit');
    }
  }
}
