/**
 * Format a points value for display.
 * Whole numbers render with no decimals (5 -> "5").
 * Fractional values render with up to 2 decimals, no trailing zeros
 * (1.5 -> "1.5", 2.25 -> "2.25", 1.6666 -> "1.67").
 * Handles null/undefined gracefully (returns "0").
 */
export function formatPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  const rounded = Math.round(value * 100) / 100; // 2dp
  // String() drops trailing zeros automatically: 5 -> "5", 1.5 -> "1.5",
  // 2.25 -> "2.25". The Math.round above caps it at 2 decimals.
  return String(rounded);
}
