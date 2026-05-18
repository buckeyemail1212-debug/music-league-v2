export const fontSize = {
  micro: 11,
  small: 13,
  body: 15,
  title: 17,
  h3: 20,
  h2: 24,
  h1: 32,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export type FontSize = keyof typeof fontSize;
export type FontWeight = keyof typeof fontWeight;
