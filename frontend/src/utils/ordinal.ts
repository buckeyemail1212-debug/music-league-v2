// English ordinal suffixes: 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th".
//
// The 11th/12th/13th carve-out is the only weird case: the suffix is
// driven by the last two digits, not the last one — 11/12/13 always take
// "th" regardless of what the final digit looks like (so we get "11th"
// not "11st", "12th" not "12nd", "13th" not "13rd"). Numbers ≥ 100
// repeat the same pattern off the last two digits: 111th, 112th, 113th,
// then 121st, 122nd, 123rd, etc.
export function getOrdinalSuffix(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
