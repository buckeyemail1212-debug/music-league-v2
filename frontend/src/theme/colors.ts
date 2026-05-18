// Palette values extracted from the existing codebase (hex frequency scan
// across app/ and src/components/). Counts noted next to each entry. Service
// brand colors (Spotify green, Apple Music red, YouTube red) and per-genre
// taste-bar colors are intentionally omitted — they're literal brand tokens,
// not theme tokens.

export const colors = {
  // Backgrounds
  bgPrimary: '#121212',    // 38 uses — root screen background
  bgSecondary: '#181818',  // 54 uses — cards, group containers
  bgTertiary: '#282828',   // 34 uses — inputs, skeletons, sub-surfaces

  // Text
  textPrimary: '#FFFFFF',  // 298 uses — primary foreground
  textSecondary: '#B3B3B3', // 166 uses — captions, secondary text
  textTertiary: '#6A6A6A',  //  55 uses — disabled / tertiary

  // Brand
  accent: '#7C3AED',       // 143 uses — primary accent (purple)
  accentMuted: '#A78BFA',  //   2 uses — muted accent text inside pills

  // Semantic
  error: '#EF4444',        // 17 uses — destructive / "NOT FINISHED" tag
  success: '#10B981',      //  9 uses — success states
  warning: '#F59E0B',      //  8 uses — warning, trophy/highlight gold
  info: '#3B82F6',         //  4 uses — link / informational blue
} as const;

export type Color = keyof typeof colors;
