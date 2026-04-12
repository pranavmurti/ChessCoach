/** Split a Lichess-style concatenated PGN export into individual games. */
export function splitConcatenatedPgns(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  return t
    .split(/\n\n(?=\[Event\s)/)
    .map((s) => s.trim())
    .filter((s) => s.includes("[Event "));
}
