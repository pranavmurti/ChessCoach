/** FEN fullmove field: increments after each Black move; starts at 1. */
export function fullmoveNumberFromFen(fen: string): number {
  const parts = fen.trim().split(/\s+/);
  const raw = parts[5];
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * While fullmove ≤ this value, we treat the game as “opening” and skip
 * Elo-weakened suggestions (still analyze at full strength).
 */
export const OPENING_MAX_FULLMOVE = 7;

export function isPastOpeningPhase(fen: string): boolean {
  return fullmoveNumberFromFen(fen) > OPENING_MAX_FULLMOVE;
}
