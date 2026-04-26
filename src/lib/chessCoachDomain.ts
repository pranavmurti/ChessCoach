import { Chess } from "chess.js";

export const WHITE_ELO_STORAGE = "chess-coach-white-elo";
export const BLACK_ELO_STORAGE = "chess-coach-black-elo";

export const BLUNDER_CP_THRESHOLD = 250;
export const LIVE_DEPTH = 10;
export const LIVE_DEBOUNCE_MS = 350;

export const MISTAKE_CP_THRESHOLD = 100;
export const MISSED_CP_THRESHOLD = 150;
export const AMAZING_CP_THRESHOLD = 30;
export const SACRIFICE_MATERIAL_THRESHOLD = 300;
/** Net material (centipawns) the mover gives up on the board — at least ~one pawn to count as a sac. */
export const BRILLIANT_MIN_MATERIAL_LOSS = 100;
/** After the move, mover must be clearly winning (White-centric eval). */
export const BRILLIANT_WINNING_CP_ADV = 350;
export const BRILLIANT_WINNING_MATE_MAX = 12;
export const REVIEW_INACCURACY_CP_THRESHOLD = 50;
/** Lower value makes accuracy stricter (drops faster on eval loss). */
export const ACCURACY_DECAY_CP = 28;
export const REVIEW_BLUNDER_CP_THRESHOLD = 250;
export const MISTAKE_SIGN_FLIP_CP_DROP = 50;
export const BLUNDER_SIGN_FLIP_CP_DROP = 150;
export const CRITICAL_BLUNDER_CP_THRESHOLD = 350;
export const CRITICAL_MISSED_CP_THRESHOLD = 260;
export const CRITICAL_CHOICE_MIN_LOSS = 170;
export const STILL_WINNING_CP_THRESHOLD = 180;
export const GOOD_OPTION_CP_WINDOW = 60;
export const GAME_DEPTH = 10;
export const GAME_MULTIPV = 5;

export type GameMove = { uci: string; san: string; color: "w" | "b" };
export type MoveIcon = "T" | "I" | "M" | "B" | "X" | "!!" | "G";
export type MissEase = "easy" | "tough";

export type MissedMoment = {
  ply: number;
  mover: "White" | "Black";
  move: string;
  lossCp: number;
  bestUci: string;
  eloBestUci: string;
  difficulty: MissEase;
};

export type EvalPoint = { cpWhite: number | null; mateWhite: number | null };
export type CriticalTag =
  | "missed tactic"
  | "blunder"
  | "advantage lost"
  | "critical choice";

export type ReviewMove = {
  ply: number;
  moveNo: number;
  side: "White" | "Black";
  playedSan: string;
  bestSan: string | null;
  bestUci: string;
  eloBestUci: string;
  bestLineSans: string;
  topUcis: string[];
  landedSquare: string;
  lossCp: number | null;
  verdict:
    | "excellent"
    | "good"
    | "inaccuracy"
    | "mistake"
    | "blunder"
    | "missed win"
    | "brilliant";
  writeup: string;
};

export type CriticalMoment = {
  ply: number;
  moveNo: number;
  side: "White" | "Black";
  tag: CriticalTag;
  note: string;
};

export type GameAnalysisMove = {
  icon: MoveIcon | null;
  lossCp: number | null;
  isMissed: boolean;
  opening: boolean;
};

export type GameAnalysis = {
  accuracyWhite: number;
  accuracyBlack: number;
  evalSeries: EvalPoint[];
  moveInfo: GameAnalysisMove[];
  missed: MissedMoment[];
  review: ReviewMove[];
  critical: CriticalMoment[];
};

export function reconstructFenForPly(
  initialFen: string,
  moves: GameMove[],
  plyIndex: number,
): string {
  const chess = new Chess(initialFen);
  for (let i = 0; i < plyIndex; i++) {
    const uci = moves[i]?.uci;
    if (!uci) break;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length >= 5 ? uci[4] : undefined;
    try {
      const ok = chess.move({
        from: from as never,
        to: to as never,
        promotion:
          promo === "q" || promo === "r" || promo === "b" || promo === "n"
            ? promo
            : undefined,
      });
      if (!ok) break;
    } catch {
      break;
    }
  }
  return chess.fen();
}

/** True if the position is crushing for `mover` (mate soon or large eval edge). */
export function moverHasCrushingAdvantage(
  cpWhite: number | null,
  mateWhite: number | null,
  mover: "w" | "b",
): boolean {
  if (mateWhite != null) {
    if (mover === "w") {
      return mateWhite > 0 && mateWhite <= BRILLIANT_WINNING_MATE_MAX;
    }
    return mateWhite < 0 && Math.abs(mateWhite) <= BRILLIANT_WINNING_MATE_MAX;
  }
  if (cpWhite == null) return false;
  const adv = mover === "w" ? cpWhite : -cpWhite;
  return adv >= BRILLIANT_WINNING_CP_ADV;
}

export function materialSumForMover(fen: string, mover: "w" | "b"): number {
  const placement = fen.split(" ")[0];
  const values: Record<string, number> = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 0,
  };
  let sum = 0;
  for (const ch of placement.replaceAll("/", "")) {
    if (/[1-8]/.test(ch)) continue;
    const isWhite = ch === ch.toUpperCase();
    const type = ch.toLowerCase();
    const v = values[type] ?? 0;
    if ((mover === "w" && isWhite) || (mover === "b" && !isWhite)) {
      sum += v;
    }
  }
  return sum;
}
