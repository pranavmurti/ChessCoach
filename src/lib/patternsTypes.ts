import type { GameMove } from "@/lib/chessCoachDomain";

export type PatternProvider = "lichess" | "chesscom";

export type MistakeCategory =
  | "positional"
  | "tactical_miss"
  | "piece_blunder";

export type PatternMistake = {
  category: MistakeCategory;
  /** Short label e.g. "Move 12 · Black · Bxc3" */
  label: string;
  count: number;
  avgLossCp: number;
  exampleFen: string;
  bestUci: string;
  /** Full engine PV from the root (space-separated UCI); first move is bestUci. */
  pvUci: string;
  playedUci: string;
  /** Side you played in the source game (only your moves are scanned). */
  userColor: "w" | "b";
  /** Ply index of the mistake in the game (for related-puzzle derivation). */
  examplePly: number;
  /** Start FEN of that game (standard or from PGN headers). */
  initialFen: string;
  /** Mainline moves from initialFen; used to build training puzzles at nearby plies. */
  gameMoves: GameMove[];
  /** Clickable URL to the game where this position came from (if detectable). */
  sourceGameUrl?: string;
};

export type PatternPuzzle = {
  category: MistakeCategory;
  fen: string;
  solutionUci: string;
  /** Same as scan PV from root; falls back to solutionUci when only one ply. */
  pvUci: string;
  prompt: string;
  /** Clickable URL to the game where this position came from (if detectable). */
  sourceGameUrl?: string;
};

export type PatternScanResult = {
  gamesScanned: number;
  gamesSkippedNoUserColor: number;
  pliesAnalyzed: number;
  /** Up to 10 per category, merged from frequency */
  topMistakes: Record<MistakeCategory, PatternMistake[]>;
  puzzles: PatternPuzzle[];
  note?: string;
};
