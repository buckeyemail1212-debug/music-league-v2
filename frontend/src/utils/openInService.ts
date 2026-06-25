import { Linking } from 'react-native';

export type MusicService = 'spotify' | 'apple' | 'youtube';

export function openInService(song: { title: string; artist: string }, service: MusicService) {
  const query = encodeURIComponent(`${song.title} ${song.artist}`);
  let url = '';
  switch (service) {
    case 'spotify': url = `https://open.spotify.com/search/${query}`; break;
    case 'apple':   url = `https://music.apple.com/search?term=${query}`; break;
    case 'youtube': url = `https://www.youtube.com/results?search_query=${query}`; break;
  }
  Linking.openURL(url);
}
