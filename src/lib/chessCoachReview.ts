import { Chess } from "chess.js";

import {
  engineScoreToWhitePerspective,
  explainBestMoveIdea,
  uciSequenceToSan,
  uciToSan,
} from "@/lib/chessNotation";
import { lookupOpening } from "@/lib/openings";
import type { StockfishClient } from "@/lib/stockfishClient";
import {
  reconstructFenForPly,
  type GameAnalysis,
  type GameAnalysisMove,
  type GameMove,
  type MissedMoment,
  type MissEase,
  type ReviewMove,
  type EvalPoint,
  type CriticalMoment,
  type MoveIcon,
  BLUNDER_CP_THRESHOLD,
  MISTAKE_CP_THRESHOLD,
  MISSED_CP_THRESHOLD,
  AMAZING_CP_THRESHOLD,
  REVIEW_INACCURACY_CP_THRESHOLD,
  ACCURACY_DECAY_CP,
  REVIEW_BLUNDER_CP_THRESHOLD,
  MISTAKE_SIGN_FLIP_CP_DROP,
  BLUNDER_SIGN_FLIP_CP_DROP,
  CRITICAL_BLUNDER_CP_THRESHOLD,
  CRITICAL_MISSED_CP_THRESHOLD,
  CRITICAL_CHOICE_MIN_LOSS,
  STILL_WINNING_CP_THRESHOLD,
  GOOD_OPTION_CP_WINDOW,
  GAME_DEPTH,
  GAME_MULTIPV,
  materialSumForMover,
  BRILLIANT_MIN_MATERIAL_LOSS,
  moverHasCrushingAdvantage,
} from "@/lib/chessCoachDomain";

async function verifyBrilliantSacrificeWin(
  client: StockfishClient,
  afterFen: string,
  mover: "w" | "b",
  ctx: { depth: number; seq: number; seqRef: { current: number } },
): Promise<boolean> {
  const full = await client.analyzePosition(afterFen, {
    depth: ctx.depth,
    multipv: 1,
  });
  if (ctx.seq !== ctx.seqRef.current) return false;
  const line = full.lines[0];
  const stm = new Chess(afterFen).turn();
  const { cpWhite, mateWhite } = engineScoreToWhitePerspective(
    stm,
    line?.cp,
    line?.mate,
  );
  return moverHasCrushingAdvantage(cpWhite, mateWhite, mover);
}

export async function runFullGameReview(args: {
  client: StockfishClient;
  gameInitialFen: string;
  gameMoves: GameMove[];
  whiteRating: number;
  blackRating: number;
  seq: number;
  seqRef: { current: number };
}): Promise<GameAnalysis> {
  const {
    client,
    gameInitialFen,
    gameMoves,
    whiteRating,
    blackRating,
    seq,
    seqRef,
  } = args;

  const chess = new Chess(gameInitialFen);
  const evalSeries: EvalPoint[] = [];
  const moveInfo: GameAnalysisMove[] = [];
  const missed: MissedMoment[] = [];
  const review: ReviewMove[] = [];
  const critical: CriticalMoment[] = [];

  const beforeFens: string[] = [];
  const bestUciPerPly: string[] = [];
  const lossCpPerPly: (number | null)[] = [];
  const moverColorPerPly: ("w" | "b")[] = [];

  for (let ply = 0; ply < gameMoves.length; ply++) {
    const beforeFen = chess.fen();
    beforeFens.push(beforeFen);
    const stm = chess.turn();
    const mover = gameMoves[ply].color;
    moverColorPerPly.push(mover);

    const materialBefore = materialSumForMover(beforeFen, mover);

    const playedUci = gameMoves[ply].uci;

    const full = await client.analyzePosition(beforeFen, {
      depth: GAME_DEPTH,
      multipv: GAME_MULTIPV,
    });
    if (seq !== seqRef.current) {
      return {
        accuracyWhite: 0,
        accuracyBlack: 0,
        evalSeries: [],
        moveInfo: [],
        missed: [],
        review: [],
        critical: [],
      };
    }

    const bestLine = full.lines.find((l) => l.multipv === 1) ?? full.lines[0];
    const topUcis = full.lines
      .filter((l) => l.multipv >= 1 && l.multipv <= 3)
      .sort((a, b) => a.multipv - b.multipv)
      .map((l) => l.pvUci.split(/\s+/)[0] ?? "")
      .filter(Boolean);

    const bestUci =
      full.bestUci || (bestLine?.pvUci.split(/\s+/)[0] ?? playedUci);
    bestUciPerPly.push(bestUci);

    const bestCp = bestLine?.cp;
    const bestMate = bestLine?.mate;

    const playedFirstToken = playedUci;
    const chosenLine =
      full.lines.find((l) => (l.pvUci.split(/\s+/)[0] ?? "") === playedFirstToken) ??
      bestLine;
    const chosenCp = chosenLine?.cp;
    const chosenMate = chosenLine?.mate;

    let lossCp: number | null = null;
    if (bestCp != null && chosenCp != null) {
      lossCp = Math.max(0, bestCp - chosenCp);
    } else if (chosenMate != null) {
      lossCp = 1000;
    }

    lossCpPerPly.push(lossCp);

    const book = await lookupOpening(beforeFen);
    const opening = book != null;

    const playedOk = chess.move({
      from: playedUci.slice(0, 2) as never,
      to: playedUci.slice(2, 4) as never,
      promotion:
        playedUci.length >= 5 &&
        ["q", "r", "b", "n"].includes(playedUci[4].toLowerCase())
          ? (playedUci[4].toLowerCase() as "q" | "r" | "b" | "n")
          : undefined,
    });
    if (!playedOk) {
      throw new Error(`Invalid move in game at ply ${ply}`);
    }

    const materialAfter = materialSumForMover(chess.fen(), mover);
    const materialLoss = materialBefore - materialAfter;

    const stillWinningForMover =
      chosenCp != null && chosenCp >= STILL_WINNING_CP_THRESHOLD;
    const isBlunderCore = lossCp != null && lossCp >= BLUNDER_CP_THRESHOLD;

    const bestWhite = engineScoreToWhitePerspective(stm, bestCp, bestMate).cpWhite;
    const chosenWhite = engineScoreToWhitePerspective(
      stm,
      chosenCp,
      chosenMate,
    ).cpWhite;

    const signFlip =
      bestWhite != null &&
      chosenWhite != null &&
      ((bestWhite > 0 && chosenWhite < 0) || (bestWhite < 0 && chosenWhite > 0));

    const signFlipDrop =
      bestWhite != null && chosenWhite != null
        ? Math.abs(bestWhite - chosenWhite)
        : 0;

    const signFlipMistake =
      signFlip && signFlipDrop >= MISTAKE_SIGN_FLIP_CP_DROP;
    const signFlipBlunder =
      signFlip && signFlipDrop >= BLUNDER_SIGN_FLIP_CP_DROP;

    const isBlunder = isBlunderCore && !stillWinningForMover;
    const isMissedWin = isBlunderCore && stillWinningForMover;
    const isMistake =
      signFlipMistake || (lossCp != null && lossCp >= MISTAKE_CP_THRESHOLD);
    const isAmazing = lossCp != null && lossCp <= AMAZING_CP_THRESHOLD;
    const playedMatchesBest = playedUci === bestUci;
    const materialSacrifice = materialLoss >= BRILLIANT_MIN_MATERIAL_LOSS;
    const playedNearBest = lossCp != null && lossCp <= AMAZING_CP_THRESHOLD;
    let isBrilliant = false;
    if (playedMatchesBest && materialSacrifice && playedNearBest) {
      isBrilliant = await verifyBrilliantSacrificeWin(client, chess.fen(), mover, {
        depth: 12,
        seq,
        seqRef,
      });
    }

    let icon: MoveIcon | null = null;
    if (isBlunder) icon = "B";
    else if (isMissedWin) icon = "X";
    else if (isMistake) icon = "M";
    else if (lossCp != null && lossCp >= REVIEW_INACCURACY_CP_THRESHOLD)
      icon = "I";
    else if (isBrilliant) icon = "!!";
    else if (opening) icon = "T";
    else if (isAmazing) icon = "G";

    const isMissed = lossCp != null && lossCp >= MISSED_CP_THRESHOLD;

    const { cpWhite, mateWhite } = engineScoreToWhitePerspective(
      stm,
      bestCp,
      bestMate,
    );
    evalSeries.push({ cpWhite, mateWhite });

    moveInfo.push({
      icon,
      lossCp,
      isMissed,
      opening,
    });

    if (isMissed) {
      missed.push({
        ply,
        mover: mover === "w" ? "White" : "Black",
        move: gameMoves[ply].san,
        lossCp: lossCp ?? 0,
        bestUci,
        eloBestUci: "",
        difficulty: "tough",
      });
    }

    const playedSan = gameMoves[ply].san;
    const bestSan = uciToSan(beforeFen, bestUci);
    const side = mover === "w" ? "White" : "Black";
    const moveNo = Math.floor(ply / 2) + 1;

    let verdict: ReviewMove["verdict"] = "good";
    if (lossCp == null) verdict = "good";
    else if (isBrilliant) verdict = "brilliant";
    else if (signFlipBlunder && !stillWinningForMover) verdict = "blunder";
    else if (lossCp >= REVIEW_BLUNDER_CP_THRESHOLD) {
      verdict = stillWinningForMover ? "missed win" : "blunder";
    } else if (lossCp >= MISTAKE_CP_THRESHOLD) verdict = "mistake";
    else if (lossCp >= REVIEW_INACCURACY_CP_THRESHOLD) verdict = "inaccuracy";
    else if (lossCp <= 10) verdict = "excellent";

    const pvSans = bestLine?.pvUci
      ? uciSequenceToSan(beforeFen, bestLine.pvUci, 6)
      : [];
    const bestLineSans = pvSans.length ? pvSans.join(" ") : "";

    const idea =
      bestUci && bestLine?.pvUci
        ? explainBestMoveIdea(
            beforeFen,
            bestUci,
            bestLine.pvUci,
            mateWhite != null ? null : cpWhite,
            mateWhite,
          )
        : "Run analysis to see the best-move idea.";

    const lossTxt =
      lossCp == null
        ? ""
        : lossCp >= REVIEW_BLUNDER_CP_THRESHOLD && stillWinningForMover
          ? "It misses a cleaner win and lets the position become less forcing."
          : lossCp >= REVIEW_BLUNDER_CP_THRESHOLD
            ? "It swings the evaluation heavily."
            : lossCp >= MISTAKE_CP_THRESHOLD
              ? "It drops the evaluation noticeably."
              : lossCp >= REVIEW_INACCURACY_CP_THRESHOLD
                ? "It slightly worsens the evaluation."
                : "It keeps the evaluation close to best.";

    const writeup = opening
      ? `${side} played ${playedSan}. Still in opening book: ${book!.eco} ${book!.name}.`
      : bestSan && bestSan !== playedSan
        ? `${side} played ${playedSan}. A stronger practical choice was ${bestSan}. ${signFlip ? "This flips the position from better for one side to better for the other." : lossTxt} ${idea}`.trim()
        : `${side} played ${playedSan}. Looks close to best. ${idea}`.trim();

    review.push({
      ply,
      moveNo,
      side,
      playedSan,
      bestSan,
      bestUci,
      eloBestUci: "",
      bestLineSans,
      topUcis,
      landedSquare: playedUci.slice(2, 4),
      lossCp,
      verdict,
      writeup,
    });

    const goodOptionCount = full.lines.filter(
      (l) =>
        bestLine?.cp != null &&
        l.cp != null &&
        bestLine.cp - l.cp <= GOOD_OPTION_CP_WINDOW,
    ).length;

    if (
      !opening &&
      goodOptionCount > 0 &&
      goodOptionCount <= 2 &&
      lossCp != null &&
      lossCp >= CRITICAL_CHOICE_MIN_LOSS
    ) {
      critical.push({
        ply,
        moveNo,
        side,
        tag: "critical choice",
        note: `Only ${goodOptionCount} strong option${goodOptionCount === 1 ? "" : "s"} here`,
      });
    }

    if (lossCp != null && lossCp >= CRITICAL_BLUNDER_CP_THRESHOLD) {
      critical.push({
        ply,
        moveNo,
        side,
        tag: stillWinningForMover ? "advantage lost" : "blunder",
        note: stillWinningForMover
          ? `${playedSan} (missed a clearer win)`
          : `${playedSan} (large evaluation swing)`,
      });
    } else if (lossCp != null && lossCp >= CRITICAL_MISSED_CP_THRESHOLD) {
      critical.push({
        ply,
        moveNo,
        side,
        tag: "missed tactic",
        note: `${playedSan} (missed ${bestSan ?? bestUci})`,
      });
    }
  }

  let whiteSum = 0;
  let whiteN = 0;
  let blackSum = 0;
  let blackN = 0;
  for (let ply = 0; ply < gameMoves.length; ply++) {
    const mover = gameMoves[ply].color;
    const lossCp = lossCpPerPly[ply];
    if (lossCp == null) continue;
    const score = Math.round(
      Math.max(0, 100 * Math.exp(-lossCp / ACCURACY_DECAY_CP)),
    );
    if (mover === "w") {
      whiteSum += score;
      whiteN++;
    } else {
      blackSum += score;
      blackN++;
    }
  }

  const accuracyWhite = whiteN > 0 ? Math.round(whiteSum / whiteN) : 0;
  const accuracyBlack = blackN > 0 ? Math.round(blackSum / blackN) : 0;

  const missedSlice = missed.slice(0, 12);
  for (const mm of missedSlice) {
    const beforeFen = beforeFens[mm.ply];
    const eloBest = await client.bestMoveAtElo(
      beforeFen,
      gameMoves[mm.ply].color === "w" ? whiteRating : blackRating,
      10,
    );
    if (seq !== seqRef.current) {
      return {
        accuracyWhite,
        accuracyBlack,
        evalSeries,
        moveInfo,
        missed,
        review,
        critical,
      };
    }
    const difficulty: MissEase =
      eloBest === bestUciPerPly[mm.ply] ? "easy" : "tough";
    mm.eloBestUci = eloBest;
    mm.difficulty = difficulty;
  }

  const reviewSlice = review.slice(0, Math.min(review.length, 60));
  for (const rm of reviewSlice) {
    const beforeFen = beforeFens[rm.ply];
    const eloBest = await client.bestMoveAtElo(
      beforeFen,
      moverColorPerPly[rm.ply] === "w" ? whiteRating : blackRating,
      10,
    );
    if (seq !== seqRef.current) {
      return {
        accuracyWhite,
        accuracyBlack,
        evalSeries,
        moveInfo,
        missed,
        review,
        critical,
      };
    }
    rm.eloBestUci = eloBest;
  }

  const finalMissed = missed.map((m) => {
    const updated = missedSlice.find((x) => x.ply === m.ply);
    return updated ?? m;
  });

  return {
    accuracyWhite,
    accuracyBlack,
    evalSeries,
    moveInfo,
    missed: finalMissed,
    review,
    critical,
  };
}

/** Re-analyze one ply when user explores a branch during review. */
export async function analyzeNewMoveDuringReview(
  client: StockfishClient,
  gameInitialFen: string,
  moves: GameMove[],
  ply: number,
): Promise<{
  rowMoveInfo: GameAnalysisMove;
  rowReview: ReviewMove;
  chosenWhiteRounded: number | null;
} | null> {
  await client.init();
  if (ply < 0 || ply >= moves.length) return null;

  const beforeFen = reconstructFenForPly(gameInitialFen, moves, ply);
  const played = moves[ply];
  const stm = new Chess(beforeFen).turn();
  const side: "White" | "Black" = stm === "w" ? "White" : "Black";
  const moveNo = Math.floor(ply / 2) + 1;

  const analysis = await client.analyzePosition(beforeFen, {
    depth: GAME_DEPTH,
    multipv: GAME_MULTIPV,
  });
  const top = analysis.lines
    .slice()
    .sort((a, b) => (a.multipv ?? 99) - (b.multipv ?? 99));
  const best = top[0];
  if (!best) return null;

  const bestCp = best.cp ?? null;
  const bestMate = best.mate ?? null;
  const bestUci = best.pvUci.split(/\s+/)[0] ?? "";
  const bestSan = bestUci ? uciToSan(beforeFen, bestUci) : null;
  const topUcis = top
    .map((l) => l.pvUci.split(/\s+/)[0] ?? "")
    .filter(Boolean)
    .slice(0, 3);

  const playedUci = played.uci;
  const chosen = top.find((l) => (l.pvUci.split(/\s+/)[0] ?? "") === playedUci);
  const chosenCp = chosen?.cp ?? null;
  const chosenMate = chosen?.mate ?? null;

  const matProbe = new Chess(beforeFen);
  const matOk = matProbe.move({
    from: playedUci.slice(0, 2) as never,
    to: playedUci.slice(2, 4) as never,
    promotion:
      playedUci.length >= 5 &&
      ["q", "r", "b", "n"].includes(playedUci[4].toLowerCase())
        ? (playedUci[4].toLowerCase() as "q" | "r" | "b" | "n")
        : undefined,
  });
  const materialBefore = materialSumForMover(beforeFen, played.color);
  const materialLoss = matOk
    ? materialBefore - materialSumForMover(matProbe.fen(), played.color)
    : 0;

  const fallback = (() => {
    const c = new Chess(beforeFen);
    const ok = c.move({
      from: playedUci.slice(0, 2) as never,
      to: playedUci.slice(2, 4) as never,
      promotion:
        playedUci.length >= 5 &&
        ["q", "r", "b", "n"].includes(playedUci[4].toLowerCase())
          ? (playedUci[4].toLowerCase() as "q" | "r" | "b" | "n")
          : undefined,
    });
    if (!ok) return null;
    return engineScoreToWhitePerspective(
      c.turn(),
      -(bestCp ?? 0),
      bestMate == null ? undefined : -bestMate,
    ).cpWhite;
  })();

  const bestWhite = engineScoreToWhitePerspective(
    stm,
    bestCp ?? undefined,
    bestMate ?? undefined,
  ).cpWhite;
  const chosenWhite =
    chosenCp != null || chosenMate != null
      ? engineScoreToWhitePerspective(
          stm,
          chosenCp ?? undefined,
          chosenMate ?? undefined,
        ).cpWhite
      : fallback;

  const lossCp =
    bestWhite != null && chosenWhite != null
      ? Math.max(0, Math.round(Math.abs(bestWhite - chosenWhite)))
      : null;

  const signFlip =
    bestWhite != null &&
    chosenWhite != null &&
    ((bestWhite > 0 && chosenWhite < 0) || (bestWhite < 0 && chosenWhite > 0));
  const signFlipDrop =
    bestWhite != null && chosenWhite != null
      ? Math.abs(bestWhite - chosenWhite)
      : 0;

  const stillWinningForMover =
    chosenCp != null && chosenCp >= STILL_WINNING_CP_THRESHOLD;
  const isBlunderCore = lossCp != null && lossCp >= REVIEW_BLUNDER_CP_THRESHOLD;
  const isMissedWin = isBlunderCore && stillWinningForMover;
  const isMistake =
    (signFlip && signFlipDrop >= MISTAKE_SIGN_FLIP_CP_DROP) ||
    (lossCp != null && lossCp >= MISTAKE_CP_THRESHOLD);
  const isBlunder =
    (signFlip && signFlipDrop >= BLUNDER_SIGN_FLIP_CP_DROP && !stillWinningForMover) ||
    (isBlunderCore && !stillWinningForMover);
  const playedMatchesBest = playedUci === bestUci;
  const materialSacrifice = materialLoss >= BRILLIANT_MIN_MATERIAL_LOSS;
  const nearBest = lossCp != null && lossCp <= AMAZING_CP_THRESHOLD;
  let isBrilliant = false;
  if (playedMatchesBest && materialSacrifice && nearBest && matOk) {
    isBrilliant = await verifyBrilliantSacrificeWin(
      client,
      matProbe.fen(),
      played.color,
      { depth: 12, seq: 0, seqRef: { current: 0 } },
    );
  }

  let icon: MoveIcon | null = null;
  if (isBlunder) icon = "B";
  else if (isMissedWin) icon = "X";
  else if (isMistake) icon = "M";
  else if (lossCp != null && lossCp >= REVIEW_INACCURACY_CP_THRESHOLD) icon = "I";
  else if (isBrilliant) icon = "!!";

  let verdict: ReviewMove["verdict"] = "good";
  if (isBrilliant) verdict = "brilliant";
  else if (isBlunder) verdict = "blunder";
  else if (isMissedWin) verdict = "missed win";
  else if (isMistake) verdict = "mistake";
  else if (lossCp != null && lossCp >= REVIEW_INACCURACY_CP_THRESHOLD)
    verdict = "inaccuracy";
  else if (playedUci === bestUci) verdict = "excellent";

  const bestLineRaw = best.pvUci ? uciSequenceToSan(beforeFen, best.pvUci, 8) : "";
  const bestLineSans = Array.isArray(bestLineRaw)
    ? bestLineRaw.join(" ")
    : bestLineRaw;
  const opening = (await lookupOpening(beforeFen)) != null;
  const gameMiss = lossCp != null && lossCp >= MISSED_CP_THRESHOLD;
  const writeup = opening
    ? `${side} played ${played.san}. Still in opening book.`
    : bestSan && bestSan !== played.san
      ? `${side} played ${played.san}. Best was ${bestSan}.`
      : `${side} played ${played.san}. Solid practical move.`;

  const rowMoveInfo: GameAnalysisMove = {
    icon,
    lossCp,
    isMissed: gameMiss,
    opening,
  };

  const rowReview: ReviewMove = {
    ply,
    moveNo,
    side,
    playedSan: played.san,
    bestSan,
    bestUci,
    eloBestUci: bestUci,
    bestLineSans,
    topUcis,
    landedSquare: playedUci.slice(2, 4),
    lossCp,
    verdict,
    writeup,
  };

  const chosenWhiteRounded =
    chosenWhite != null ? Math.round(chosenWhite) : null;

  return {
    rowMoveInfo,
    rowReview,
    chosenWhiteRounded,
  };
}
