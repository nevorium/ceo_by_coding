/**
 * @fileoverview Universal EventEmitter that works in both Browser and Node.js environments.
 */
export class UniversalEventEmitter {
  constructor() {
    this._events = new Map();
  }

  on(event, fn) {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event).push(fn);
    return this;
  }

  once(event, fn) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      fn(...args);
    };
    return this.on(event, wrapper);
  }

  off(event, fn) {
    const list = this._events.get(event);
    if (!list) return this;
    this._events.set(event, list.filter(cb => cb !== fn));
    return this;
  }

  removeListener(event, fn) {
    return this.off(event, fn);
  }

  emit(event, ...args) {
    const list = this._events.get(event);
    if (!list || list.length === 0) return false;
    // Iterate over a copy so listeners can safely unsubscribe
    [...list].forEach(cb => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`Error in event listener for '${event}':`, err);
      }
    });
    return true;
  }

  removeAllListeners(event) {
    if (event) {
      this._events.delete(event);
    } else {
      this._events.clear();
    }
    return this;
  }
}

export default UniversalEventEmitter;
