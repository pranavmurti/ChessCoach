import { Chess, type Square } from "chess.js";

export function uciToSan(fen: string, uci: string): string | null {
  if (uci.length < 4) return null;
  const chess = new Chess(fen);
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promo = uci[4] as "q" | "r" | "b" | "n" | undefined;
  const move = chess.move({
    from,
    to,
    promotion: promo === "q" || promo === "r" || promo === "b" || promo === "n"
      ? promo
      : undefined,
  });
  return move?.san ?? null;
}

export function formatCp(cp: number | undefined, mate: number | undefined): string {
  if (mate !== undefined) {
    const m = Math.abs(mate);
    return mate > 0 ? `M${m} for White` : `M${m} for Black`;
  }
  if (cp === undefined) return "—";
  const pawns = (cp / 100).toFixed(1);
  return cp >= 0 ? `+${pawns} (White)` : `${pawns} (Black)`;
}

/** Stockfish scores are for the side to move; convert to White-centric view. */
export function engineScoreToWhitePerspective(
  sideToMove: "w" | "b",
  cp: number | undefined,
  mate: number | undefined,
): { cpWhite: number | null; mateWhite: number | null } {
  if (mate !== undefined) {
    if (sideToMove === "w") {
      return { cpWhite: null, mateWhite: mate };
    }
    return { cpWhite: null, mateWhite: -mate };
  }
  if (cp === undefined) {
    return { cpWhite: null, mateWhite: null };
  }
  const cpWhite = sideToMove === "w" ? cp : -cp;
  return { cpWhite, mateWhite: null };
}

/** Compact label next to the eval bar (White’s perspective). */
export function formatEvalBarLabel(
  cpWhite: number | null,
  mateWhite: number | null,
): string {
  if (mateWhite != null) {
    if (mateWhite > 0) return `+M${mateWhite}`;
    if (mateWhite < 0) return `-M${Math.abs(mateWhite)}`;
  }
  if (cpWhite == null) return "—";
  const p = (cpWhite / 100).toFixed(1);
  return (cpWhite >= 0 ? "+" : "") + p;
}

/** Longer eval line for the coach panel (White’s perspective). */
export function formatWhiteEval(
  cpWhite: number | null,
  mateWhite: number | null,
): string {
  if (mateWhite != null) {
    if (mateWhite > 0) return `M${mateWhite} for White`;
    return `M${Math.abs(mateWhite)} for Black`;
  }
  if (cpWhite == null) return "—";
  const p = (cpWhite / 100).toFixed(1);
  return cpWhite >= 0 ? `+${p} (White)` : `${p} (Black)`;
}

export function uciSequenceToSan(
  fen: string,
  uciSequence: string,
  maxPlies: number,
): string[] {
  const tokens = uciSequence.trim().split(/\s+/).filter(Boolean);
  const chess = new Chess(fen);
  const out: string[] = [];

  for (const tok of tokens) {
    if (out.length >= maxPlies) break;
    if (!/^[a-h][1-8][a-h][1-8]/.test(tok)) continue;

    const from = tok.slice(0, 2) as Square;
    const to = tok.slice(2, 4) as Square;
    const promo = tok.length >= 5 ? tok[4] : undefined;
    const promotion =
      promo === "q" || promo === "r" || promo === "b" || promo === "n"
        ? promo
        : undefined;

    const m = chess.move({
      from,
      to,
      promotion,
    });

    if (!m) break;
    out.push(m.san);
  }

  return out;
}

function formatMainLineFromSans(sans: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    const moveNo = i / 2 + 1;
    const w = sans[i];
    const b = sans[i + 1];
    parts.push(`${moveNo}. ${w}${b ? ` ${b}` : ""}`);
  }
  return parts.join(" ");
}

export function explainBestMoveIdea(
  fen: string,
  bestUci: string,
  bestPvUci: string,
  cpWhite: number | null,
  mateWhite: number | null,
): string {
  if (!bestUci || bestUci.length < 4) return "Engine best move identified—run analysis to see the idea.";

  const chess = new Chess(fen);
  const from = bestUci.slice(0, 2) as Square;
  const to = bestUci.slice(2, 4) as Square;
  const promo = bestUci.length >= 5 ? bestUci[4] : undefined;
  const promotion =
    promo === "q" || promo === "r" || promo === "b" || promo === "n"
      ? promo
      : undefined;

  const move = chess.move({ from, to, promotion });
  if (!move) return "Engine best move identified—run analysis to see the idea.";

  const san = move.san;
  const givesCheck = chess.isCheck();
  const isMate = chess.isCheckmate();
  const isCastle = move.isKingsideCastle() || move.isQueensideCastle();
  const isCapture = move.isCapture();
  const isPromotion = move.isPromotion();

  const pieceNames: Record<string, string> = {
    q: "Queen",
    r: "Rook",
    b: "Bishop",
    n: "Knight",
  };

  let reason = "improves the position";
  if (isMate) reason = "finds a tactical win (mate)";
  else if (isPromotion && promotion) {
    reason = `promotes to a ${pieceNames[promotion] ?? "strong piece"}`;
  } else if (isCastle) reason = "improves king safety (castling)";
  else if (isCapture) reason = "wins/creates tactical value by capturing";
  else if (givesCheck) reason = "forces a response with check";

  const continuationSans = uciSequenceToSan(fen, bestPvUci, 6);
  const continuation = continuationSans.length
    ? formatMainLineFromSans(continuationSans)
    : "";

  const evalLine =
    cpWhite == null && mateWhite == null ? "" : `The engine expects about ${formatWhiteEval(cpWhite, mateWhite)}.`;

  if (continuation) {
    return `${san} ${reason}. ${evalLine} Main line: ${continuation}.`.trim();
  }

  return `${san} ${reason}. ${evalLine}`.trim();
}
