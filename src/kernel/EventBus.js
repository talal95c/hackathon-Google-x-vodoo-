// Bus d'événements minimal : le kernel émet, les vues/sons/HUD écoutent.
// bus.on('*', fn) reçoit tous les événements : fn(type, payload).
export class EventBus {
  #handlers = new Map();

  on(type, fn) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.#handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    this.#handlers.get(type)?.forEach((fn) => fn(payload));
    this.#handlers.get('*')?.forEach((fn) => fn(type, payload));
  }
}
