// Picks a singular or plural word based on a count. Handles the common
// irregular plural rule (add "s" unless a specific plural form is supplied).
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${word}`;
}

// Same as pluralize but returns only the word, not the count. Useful when
// the number is rendered separately in a different style.
export function pluralWord(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
