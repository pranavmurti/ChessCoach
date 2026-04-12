import { Chess } from "chess.js";

import type { StockfishClient } from "@/lib/stockfishClient";
import {
  engineScoreToWhitePerspective,
  explainBestMoveIdea,
  formatWhiteEval,
  uciSequenceToSan,
  uciToSan,
} from "@/lib/chessNotation";
import { lookupOpening } from "@/lib/openings";
import { buildOpeningGuidance } from "@/lib/openingKnowledge";
import {
  MISTAKE_CP_THRESHOLD,
  REVIEW_BLUNDER_CP_THRESHOLD,
  REVIEW_INACCURACY_CP_THRESHOLD,
} from "@/lib/chessCoachDomain";

type Intent =
  | "opening"
  | "plan"
  | "move_eval"
  | "threat"
  | "best_move"
  | "why"
  | "endgame"
  | "general";

type MoveProbe = {
  askedToken: string;
  san: string;
  lossCp: number | null;
  quality: "excellent" | "good" | "inaccuracy" | "mistake" | "blunder" | "unclear";
  refuteSan: string | null;
  refuteLine: string;
  signFlip: boolean;
  afterEvalLabel: string;
};

function materialBalanceWhite(fenText: string): number {
  const placement = fenText.split(" ")[0] ?? "";
  const values: Record<string, number> = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 0,
  };
  let sum = 0;
  for (const ch of placement) {
    const lower = ch.toLowerCase();
    if (!values[lower]) continue;
    sum += ch === lower ? -values[lower] : values[lower];
  }
  return sum;
}

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function inferIntents(question: string): Set<Intent> {
  const q = question.toLowerCase();
  const intents = new Set<Intent>();
  if (
    q.includes("opening") ||
    q.includes("book") ||
    q.includes("theory") ||
    q.includes("sicilian") ||
    q.includes("french") ||
    q.includes("caro") ||
    q.includes("ruy") ||
    q.includes("italian") ||
    q.includes("queen") ||
    q.includes("kings indian") ||
    q.includes("king's indian")
  ) {
    intents.add("opening");
  }
  if (q.includes("plan") || q.includes("idea") || q.includes("strategy")) intents.add("plan");
  if (q.includes("threat") || q.includes("danger") || q.includes("defend")) intents.add("threat");
  if (q.includes("why") || q.includes("reason") || q.includes("explain")) intents.add("why");
  if (q.includes("best move") || q.includes("what should i play") || q.includes("what should")) {
    intents.add("best_move");
  }
  if (q.includes("endgame") || q.includes("ending")) intents.add("endgame");
  const token = extractAskedMoveToken(question);
  if (token) intents.add("move_eval");
  if (!intents.size) intents.add("general");
  return intents;
}

function extractAskedMoveToken(text: string): string | null {
  const uci = text.match(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/i)?.[0];
  if (uci) return uci;
  const san = text.match(
    /\b(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8])\b/i,
  )?.[0];
  return san ?? null;
}

function inferRequestedSide(question: string, stm: "w" | "b"): "white" | "black" {
  const lowerQ = question.toLowerCase();
  if (lowerQ.includes("white")) return "white";
  if (lowerQ.includes("black")) return "black";
  return stm === "w" ? "white" : "black";
}

function estimatePhase(chess: Chess): "opening" | "middlegame" | "endgame" {
  const fen = chess.fen();
  const placement = fen.split(" ")[0] ?? "";
  const heavyPieces = (placement.match(/[qQrR]/g) ?? []).length;
  const minorPieces = (placement.match(/[nNbB]/g) ?? []).length;
  const fullmove = Number(fen.split(" ")[5] ?? "1");
  if (fullmove <= 10 && heavyPieces >= 4 && minorPieces >= 6) return "opening";
  if (heavyPieces <= 2 || minorPieces <= 3) return "endgame";
  return "middlegame";
}

function developedMinorCount(chess: Chess, side: "w" | "b"): number {
  const starts =
    side === "w"
      ? ["b1", "g1", "c1", "f1"]
      : ["b8", "g8", "c8", "f8"];
  let developed = 0;
  for (const sq of starts) {
    if (!chess.get(sq as never)) developed++;
  }
  return developed;
}

function ratingTone(elo: number, seed: number): string {
  if (elo < 1200) {
    return pick(
      [
        "I will keep this practical and low-variance.",
        "I'll focus on safe, easy-to-execute ideas.",
        "I'll prioritize blunder-avoidance over fancy lines.",
      ],
      seed,
    );
  }
  if (elo < 1800) {
    return pick(
      [
        "I will balance plans with concrete tactical checks.",
        "I'll give one strategic idea plus one forcing line.",
        "I’ll keep this practical but calculation-aware.",
      ],
      seed,
    );
  }
  return pick(
    [
      "I will include concrete trade-offs and candidate-move ranking.",
      "I’ll combine strategic plans with calculation-critical moments.",
      "I’ll optimize for objective best play with practical considerations.",
    ],
    seed,
  );
}

function buildActionChecklist(
  intents: Set<Intent>,
  elo: number,
  requestedSide: "white" | "black",
  bestSan: string | null,
): string[] {
  const sideWord = requestedSide === "white" ? "White" : "Black";
  const actions: string[] = [];
  if (intents.has("opening")) {
    actions.push(`Before move 12, ensure ${sideWord}'s king is safe and all minor pieces are developed.`);
  }
  if (bestSan) {
    actions.push(`Calculate ${bestSan} first, then compare with one safer fallback move.`);
  }
  if (intents.has("threat")) {
    actions.push("Run forcing scan every move: checks, captures, direct threats for both sides.");
  }
  if (elo < 1200) actions.push("If two moves are close, pick the one that hangs fewer pieces and keeps king safer.");
  else if (elo < 1800) actions.push("For your final choice, verify one tactical refutation before committing.");
  else actions.push("When evals are close, choose the line with better long-term pawn structure and initiative.");
  return actions.slice(0, 3);
}

async function probeAskedMove(
  askedMoveToken: string,
  currentFen: string,
  client: StockfishClient,
  bestWhiteBefore: number | null,
): Promise<MoveProbe | null> {
  const probe = new Chess(currentFen);
  const uciAsked = askedMoveToken.match(/^[a-h][1-8][a-h][1-8][qrbn]?$/i);
  let playedSan: string | null = null;
  if (uciAsked) {
    const promo = askedMoveToken[4]?.toLowerCase();
    const playedObj = probe.move({
      from: askedMoveToken.slice(0, 2) as never,
      to: askedMoveToken.slice(2, 4) as never,
      promotion:
        promo && ["q", "r", "b", "n"].includes(promo) ? (promo as "q" | "r" | "b" | "n") : undefined,
    });
    if (playedObj) playedSan = playedObj.san;
  } else {
    const playedObj = probe.move(askedMoveToken, { strict: false } as never);
    if (playedObj) playedSan = playedObj.san;
  }
  if (!playedSan) return null;

  const after = await client.analyzePosition(probe.fen(), { depth: 12, multipv: 1 });
  const replyTop = after.lines[0];
  const afterWp = engineScoreToWhitePerspective(probe.turn(), replyTop?.cp, replyTop?.mate);
  const afterWhite = afterWp.cpWhite;
  const lossCp =
    bestWhiteBefore != null && afterWhite != null
      ? Math.max(0, Math.round(Math.abs(bestWhiteBefore - afterWhite)))
      : null;
  const signFlip =
    bestWhiteBefore != null &&
    afterWhite != null &&
    ((bestWhiteBefore > 0 && afterWhite < 0) || (bestWhiteBefore < 0 && afterWhite > 0));

  const quality: MoveProbe["quality"] =
    lossCp == null
      ? "unclear"
      : lossCp >= REVIEW_BLUNDER_CP_THRESHOLD
        ? "blunder"
        : lossCp >= MISTAKE_CP_THRESHOLD
          ? "mistake"
          : lossCp >= REVIEW_INACCURACY_CP_THRESHOLD
            ? "inaccuracy"
            : lossCp <= 40
              ? "excellent"
              : "good";

  const refuteUci = replyTop?.pvUci?.split(/\s+/)[0] ?? "";
  const refuteSan = refuteUci ? uciToSan(probe.fen(), refuteUci) : null;
  const refuteLineRaw = replyTop?.pvUci ? uciSequenceToSan(probe.fen(), replyTop.pvUci, 6) : "";
  const refuteLine = Array.isArray(refuteLineRaw) ? refuteLineRaw.join(" ") : refuteLineRaw;

  return {
    askedToken: askedMoveToken,
    san: playedSan,
    lossCp,
    quality,
    refuteSan,
    refuteLine,
    signFlip,
    afterEvalLabel: formatWhiteEval(afterWp.cpWhite, afterWp.mateWhite),
  };
}

export type ThuggyParams = {
  client: StockfishClient;
  question: string;
  currentFen: string;
  openingContext?: string | null;
  whiteRating: number;
  blackRating: number;
};

export async function answerThuggyBot(p: ThuggyParams): Promise<string> {
  const q = p.question.trim();
  const currentFen = p.currentFen;
  const client = p.client;

  await client.init();
  const chess = new Chess(currentFen);
  const stm = chess.turn();
  const userElo = stm === "w" ? p.whiteRating : p.blackRating;

  const full = await client.analyzePosition(currentFen, {
    depth: 14,
    multipv: 3,
  });
  const top = full.lines
    .slice()
    .sort((a, b) => (a.multipv ?? 99) - (b.multipv ?? 99));
  const best = top[0];
  const bestUci = best?.pvUci?.split(/\s+/)[0] ?? "";
  const bestSan = bestUci ? uciToSan(currentFen, bestUci) : null;
  const bestEval = engineScoreToWhitePerspective(stm, best?.cp, best?.mate);

  const lineText = top
    .slice(0, 3)
    .map((l, i) => {
      const uci = l.pvUci.split(/\s+/)[0] ?? "";
      const san = uci ? uciToSan(currentFen, uci) : "—";
      const w = engineScoreToWhitePerspective(stm, l.cp, l.mate);
      return `${i + 1}) ${san} (${formatWhiteEval(w.cpWhite, w.mateWhite)})`;
    })
    .join("  ");

  const bestIdeaTxt = bestSan
    ? explainBestMoveIdea(
        currentFen,
        bestUci,
        best?.pvUci,
        bestEval.cpWhite,
        bestEval.mateWhite,
      )
    : null;
  const bestWhiteBefore = bestEval.cpWhite;
  const seed = hashText(`${q}|${currentFen}`);
  const intents = inferIntents(q);
  const requestedSide = inferRequestedSide(q, stm);

  const openingLabel =
    p.openingContext?.trim() ||
    (await (async () => {
      const openingInfo = await lookupOpening(currentFen);
      return openingInfo ? `${openingInfo.eco} ${openingInfo.name}`.trim() : "";
    })()) ||
    null;

  const askedMoveToken = extractAskedMoveToken(q);
  const moveProbe = askedMoveToken
    ? await probeAskedMove(askedMoveToken, currentFen, client, bestWhiteBefore)
    : null;

  const openingReasoning =
    intents.has("opening") || intents.has("plan")
      ? buildOpeningGuidance(q, openingLabel, requestedSide, userElo)
      : "";

  const directAnswer = (() => {
    if (askedMoveToken && !moveProbe) {
      return `${askedMoveToken} is not legal in this exact position, so it cannot be the recommended line right now.`;
    }
    if (moveProbe) {
      const qualityText =
        moveProbe.quality === "excellent"
          ? "very strong"
          : moveProbe.quality === "good"
            ? "playable"
            : moveProbe.quality;
      return [
        `${moveProbe.san} is ${qualityText} in this position.`,
        moveProbe.lossCp != null
          ? `Compared to best play, evaluation shift is about ${(moveProbe.lossCp / 100).toFixed(2)}.`
          : "",
        moveProbe.signFlip ? "It can flip who is better." : "",
        moveProbe.refuteSan
          ? `Most direct counter is ${moveProbe.refuteSan}${moveProbe.refuteLine ? ` with line ${moveProbe.refuteLine}.` : "."}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    if (intents.has("best_move")) {
      return bestSan
        ? `${bestSan} is the top practical candidate from this position.`
        : "No clear single move label available; compare forcing candidates first.";
    }
    if (intents.has("threat")) {
      return "The immediate priority is forcing-sequence safety: checks, captures, and direct threats from both sides before any strategic move.";
    }
    if (intents.has("opening") || intents.has("plan")) {
      return openingReasoning;
    }
    if (intents.has("why")) {
      return "A move works when it improves piece coordination without conceding tactical shots; it fails when it loosens king safety or key-square control.";
    }
    return bestSan
      ? `A good baseline is to start from ${bestSan}, then compare one positional and one tactical alternative.`
      : "Start with forcing candidates, then select the move that improves worst-placed piece and king safety.";
  })();

  const actionChecklist = buildActionChecklist(
    intents,
    userElo,
    requestedSide,
    bestSan,
  );
  const intentLine = [...intents].join(", ");
  const ratingVoice = ratingTone(userElo, seed);

  return [
    `Question: ${q}`,
    `Opening context: ${openingLabel ?? "Unknown opening"}`,
    `Interpretation: ${intentLine}. ${ratingVoice}`,
    `Answer: ${directAnswer}`,
    bestSan ? `Engine anchor: ${bestSan} (${bestUci}).` : "",
    bestIdeaTxt ? `Idea behind best move: ${bestIdeaTxt}` : "",
    actionChecklist.length
      ? `Next actions (${stm === "w" ? "White" : "Black"} to move): ${actionChecklist.map((a, i) => `${i + 1}) ${a}`).join(" ")}`
      : "",
    `Top candidates: ${lineText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
