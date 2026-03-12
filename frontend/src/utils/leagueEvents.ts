type Listener = () => void;
const listeners: Set<Listener> = new Set();

export const leagueEvents = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit() {
    listeners.forEach(fn => fn());
  },
};
