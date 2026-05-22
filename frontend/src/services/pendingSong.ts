import { Song } from './api';

let pending: Song | null = null;

export const setPendingSong = (s: Song | null) => {
  pending = s;
};

export const consumePendingSong = (): Song | null => {
  const s = pending;
  pending = null; // consume — read once, then cleared
  return s;
};
