let total = 0;
type Listener = (n: number) => void;
const listeners = new Set<Listener>();

export const unreadStore = {
  get: () => total,
  set: (n: number) => {
    if (n === total) return;
    total = n;
    listeners.forEach(l => l(total));
  },
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};
