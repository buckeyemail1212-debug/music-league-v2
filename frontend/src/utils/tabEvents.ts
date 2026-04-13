type Listener = () => void;
let pending = false;
const listeners: Set<Listener> = new Set();

export const tabEvents = {
  openNewLeague() {
    if (listeners.size > 0) {
      listeners.forEach(fn => fn());
    } else {
      // Home screen not yet mounted — queue for when it subscribes
      pending = true;
    }
  },
  onNewLeague(fn: Listener) {
    listeners.add(fn);
    if (pending) {
      pending = false;
      fn();
    }
    return () => listeners.delete(fn);
  },
};
