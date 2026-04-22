"use client";

/**
 * ChessCoach — board, live eval, coach analyze vs full review, branching, ThuggyBot.
 * Heavy review/thuggy logic lives in @/lib/chessCoachReview and @/lib/chessCoachThuggy.
 */

import { Chess, DEFAULT_POSITION } from "chess.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";

import {
  ChessBoard,
  type ChessBoardHandle,
  type ChessBoardProps,
} from "@/components/ChessBoard";
import { EvalBar } from "@/components/EvalBar";
import { EvalGraph } from "@/components/EvalGraph";
import {
  BLACK_ELO_STORAGE,
  BLUNDER_CP_THRESHOLD,
  LIVE_DEBOUNCE_MS,
  LIVE_DEPTH,
  WHITE_ELO_STORAGE,
  reconstructFenForPly,
  type GameAnalysis,
  type GameMove,
  type MoveIcon,
} from "@/lib/chessCoachDomain";
import {
  analyzeNewMoveDuringReview,
  runFullGameReview,
} from "@/lib/chessCoachReview";
import { answerThuggyBot } from "@/lib/chessCoachThuggy";
import {
  engineScoreToWhitePerspective,
  explainBestMoveIdea,
  formatWhiteEval,
  uciToSan,
} from "@/lib/chessNotation";
import { OPENING_MAX_FULLMOVE, isPastOpeningPhase } from "@/lib/fenPhase";
import { lookupOpening } from "@/lib/openings";
import { StockfishClient } from "@/lib/stockfishClient";

/* ——— Small UI ——— */

function ToolButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="rounded-xl border border-black/[0.08] bg-white/90 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-zinc-900/85 dark:hover:bg-zinc-800/90"
      {...props}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] bg-white/90 text-sm font-medium text-foreground shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-zinc-900/85 dark:hover:bg-zinc-800/90"
      {...props}
    >
      {children}
    </button>
  );
}

/* ——— Types ——— */

type EvalSnapshot = {
  cpWhite: number | null;
  mateWhite: number | null;
  fen: string;
};

type EngineTopMove = {
  rank: 1 | 2 | 3;
  uci: string;
  san: string | null;
  evalLabel: string;
};

/* ——— Component ——— */

export function ChessCoach() {
  const boardRef = useRef<ChessBoardHandle>(null);
  const engineRef = useRef<StockfishClient | null>(null);
  const analysisSeqRef = useRef(0);
  const liveSeqRef = useRef(0);
  const liveTimerRef = useRef<number | null>(null);
  const lastEvalSnapshotRef = useRef<EvalSnapshot | null>(null);
  const gameAnalysisSeqRef = useRef(0);
  const isSteppingRef = useRef(false);

  const [fen, setFen] = useState(DEFAULT_POSITION);
  const [fenField, setFenField] = useState(DEFAULT_POSITION);
  const [whiteRating, setWhiteRating] = useState(1400);
  const [blackRating, setBlackRating] = useState(1400);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    "white",
  );

  const [liveEnabled, setLiveEnabled] = useState(true);
  const [liveAnalyzing, setLiveAnalyzing] = useState(false);

  const [arrowUci, setArrowUci] = useState<{
    bestUci?: string | null;
    coachUci?: string | null;
    lineUcis?: string[];
  }>({});

  const [engineState, setEngineState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStale, setAnalysisStale] = useState(false);
  const [blunderDetected, setBlunderDetected] = useState(false);
  const [fenError, setFenError] = useState<string | null>(null);

  const [evalBar, setEvalBar] = useState<{
    cpWhite: number | null;
    mateWhite: number | null;
  } | null>(null);

  const [topMoves, setTopMoves] = useState<EngineTopMove[]>([]);
  const [coachSan, setCoachSan] = useState<string | null>(null);
  const [coachNote, setCoachNote] = useState<string | null>(null);
  const [bestIdea, setBestIdea] = useState<string | null>(null);
  const [openingInfo, setOpeningInfo] = useState<string | null>(null);

  const [thuggyQuestion, setThuggyQuestion] = useState("");
  const [thuggyReply, setThuggyReply] = useState<string | null>(null);
  const [thuggyBusy, setThuggyBusy] = useState(false);

  const [gameInitialFen, setGameInitialFen] = useState(DEFAULT_POSITION);
  const [gameMoves, setGameMoves] = useState<GameMove[]>([]);
  const [mainlineMoves, setMainlineMoves] = useState<GameMove[]>([]);
  const [branchesByPly, setBranchesByPly] = useState<
    Record<number, GameMove[][]>
  >({});
  const [branchChoiceByPly, setBranchChoiceByPly] = useState<
    Record<number, number>
  >({});
  const [gamePlyIndex, setGamePlyIndex] = useState(0);
  const [showIcons, setShowIcons] = useState(true);

  const [gameInputMode, setGameInputMode] = useState<"PGN" | "FEN">("PGN");
  const [gameInputText, setGameInputText] = useState("");
  const [gameAnalysis, setGameAnalysis] = useState<GameAnalysis | null>(null);
  const [gameAnalyzing, setGameAnalyzing] = useState(false);
  const [selectedReviewPly, setSelectedReviewPly] = useState<number | null>(
    null,
  );

  const allowCoachSuggestions = useMemo(
    () => isPastOpeningPhase(fen) || blunderDetected,
    [fen, blunderDetected],
  );

  const analysisReady = engineState === "ready" && !analyzing;

  const computeBlunderFromEvalSwing = useCallback(
    (prev: EvalSnapshot | null, next: EvalSnapshot): boolean => {
      if (!prev) return false;
      if (prev.cpWhite == null || next.cpWhite == null) return false;
      if (prev.mateWhite != null || next.mateWhite != null) return true;

      const chess = new Chess(next.fen);
      const stm = chess.turn();
      const lastMover = stm === "w" ? "b" : "w";
      const delta = next.cpWhite - prev.cpWhite;
      if (lastMover === "w") return delta < -BLUNDER_CP_THRESHOLD;
      return delta > BLUNDER_CP_THRESHOLD;
    },
    [],
  );

  const stepToPly = useCallback(
    (nextPly: number) => {
      const clamped = Math.max(0, Math.min(gameMoves.length, nextPly));
      const next = reconstructFenForPly(gameInitialFen, gameMoves, clamped);
      setSelectedReviewPly(null);
      isSteppingRef.current = true;
      boardRef.current?.setFen(next);
      isSteppingRef.current = false;
      setGamePlyIndex(clamped);
    },
    [gameInitialFen, gameMoves],
  );

  /* Elo persistence */
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem(WHITE_ELO_STORAGE));
      const b = Number(localStorage.getItem(BLACK_ELO_STORAGE));
      if (!Number.isNaN(w) && w > 0)
        setWhiteRating(Math.min(3000, Math.max(100, Math.round(w))));
      if (!Number.isNaN(b) && b > 0)
        setBlackRating(Math.min(3000, Math.max(100, Math.round(b))));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WHITE_ELO_STORAGE, String(whiteRating));
      localStorage.setItem(BLACK_ELO_STORAGE, String(blackRating));
    } catch {
      /* ignore */
    }
  }, [whiteRating, blackRating]);

  /* Engine */
  useEffect(() => {
    const client = new StockfishClient();
    engineRef.current = client;
    let cancelled = false;
    void (async () => {
      try {
        setEngineState("loading");
        await client.init();
        if (!cancelled) setEngineState("ready");
      } catch {
        if (!cancelled) setEngineState("error");
      }
    })();
    return () => {
      cancelled = true;
      client.quit();
      engineRef.current = null;
    };
  }, []);

  const runLiveEval = useCallback(
    async (fenToEval: string) => {
      const client = engineRef.current;
      if (!client || engineState !== "ready") return;
      if (analyzing) return;

      const seq = ++liveSeqRef.current;
      setLiveAnalyzing(true);
      try {
        const full = await client.analyzePosition(fenToEval, {
          depth: LIVE_DEPTH,
          multipv: 1,
        });
        if (seq !== liveSeqRef.current) return;

        const top = full.lines.find((l) => l.multipv === 1) ?? full.lines[0];
        const chess = new Chess(fenToEval);
        const stm = chess.turn();
        const { cpWhite, mateWhite } = engineScoreToWhitePerspective(
          stm,
          top?.cp,
          top?.mate,
        );

        const nextEval: EvalSnapshot = { cpWhite, mateWhite, fen: fenToEval };
        setEvalBar({ cpWhite, mateWhite });
        setBlunderDetected(
          computeBlunderFromEvalSwing(lastEvalSnapshotRef.current, nextEval),
        );
        lastEvalSnapshotRef.current = nextEval;
      } finally {
        if (seq === liveSeqRef.current) setLiveAnalyzing(false);
      }
    },
    [analyzing, computeBlunderFromEvalSwing, engineState],
  );

  useEffect(() => {
    if (!liveEnabled) return;
    if (engineState !== "ready") return;
    if (analyzing) return;
    runLiveEval(fen);
  }, [liveEnabled, engineState]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleLiveEval = useCallback(
    (fenToEval: string) => {
      if (!liveEnabled) return;
      if (engineState !== "ready") return;
      if (analyzing) return;
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      liveTimerRef.current = window.setTimeout(() => {
        runLiveEval(fenToEval);
      }, LIVE_DEBOUNCE_MS);
    },
    [analyzing, engineState, liveEnabled, runLiveEval],
  );

  useEffect(() => {
    return () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  }, []);

  const onFenChange = useCallback(
    (next: string) => {
      setFen(next);
      setFenField(next);
      setFenError(null);
      setArrowUci({});
      setAnalysisStale(true);
      setCoachSan(null);
      setCoachNote(null);
      if (!liveEnabled) setEvalBar(null);
      scheduleLiveEval(next);
    },
    [liveEnabled, scheduleLiveEval],
  );

  /* Opening name along current line */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const chess = new Chess(gameInitialFen);
      let latest: string | null = null;
      const maxPly = Math.min(gamePlyIndex, gameMoves.length);

      const initial = await lookupOpening(chess.fen());
      if (initial) latest = `${initial.eco} • ${initial.name}`;

      for (let i = 0; i < maxPly; i++) {
        const uci = gameMoves[i]?.uci;
        if (!uci) break;
        chess.move({
          from: uci.slice(0, 2) as never,
          to: uci.slice(2, 4) as never,
          promotion:
            uci[4] && ["q", "r", "b", "n"].includes(uci[4].toLowerCase())
              ? (uci[4].toLowerCase() as "q" | "r" | "b" | "n")
              : undefined,
        });
        const info = await lookupOpening(chess.fen());
        if (info) latest = `${info.eco} • ${info.name}`;
      }
      if (!cancelled) setOpeningInfo(latest);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameInitialFen, gameMoves, gamePlyIndex]);

  /* Keyboard navigation */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        t?.isContentEditable
      )
        return;

      if (e.key === "ArrowLeft") {
        if (gamePlyIndex > 0) stepToPly(gamePlyIndex - 1);
      } else if (e.key === "ArrowRight") {
        if (gamePlyIndex < gameMoves.length) {
          const ply = gamePlyIndex;
          const currentTail = gameMoves.slice(ply);
          const mainTail = mainlineMoves.slice(ply);
          const branchTails = branchesByPly[ply] ?? [];
          const all = [mainTail, currentTail, ...branchTails].filter(
            (x) => x.length > 0,
          );
          const unique = all.filter(
            (x, i) => all.findIndex((y) => y[0]?.uci === x[0]?.uci) === i,
          );
          if (unique.length > 1) {
            const idx = branchChoiceByPly[ply] ?? 0;
            const pick = unique[idx] ?? unique[0];
            if (pick !== currentTail) {
              setBranchesByPly((prev) => {
                const old = prev[ply] ?? [];
                const next = [...old];
                if (!next.some((x) => x[0]?.uci === currentTail[0]?.uci)) {
                  next.push(currentTail);
                }
                return {
                  ...prev,
                  [ply]: next.filter((x) => x[0]?.uci !== pick[0]?.uci),
                };
              });
              setGameMoves((prev) => [...prev.slice(0, ply), ...pick]);
            }
          }
          stepToPly(ply + 1);
        }
      } else if (e.key === "ArrowUp" || e.key === "Home") {
        stepToPly(0);
      } else if (e.key === "ArrowDown" || e.key === "End") {
        stepToPly(gameMoves.length);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    branchChoiceByPly,
    branchesByPly,
    gameMoves,
    gamePlyIndex,
    mainlineMoves,
    stepToPly,
  ]);

  /* Review arrows: best 3 for side to move at current ply */
  useEffect(() => {
    if (!gameAnalysis?.review?.length) {
      setArrowUci({});
      return;
    }
    const item = gameAnalysis.review[gamePlyIndex];
    if (!item) {
      setArrowUci({});
      return;
    }
    setArrowUci({
      bestUci: item.bestUci,
      coachUci: item.eloBestUci || null,
      lineUcis: item.topUcis,
    });
  }, [gameAnalysis, gamePlyIndex]);

  const applyFenInput = () => {
    const raw = fenField.trim();
    if (!raw) return;
    const ok = boardRef.current?.setFen(raw);
    if (!ok) {
      setFenError("Invalid FEN");
      return;
    }
    setFenError(null);
  };

  const runAnalysis = async () => {
    const client = engineRef.current;
    const currentFen = boardRef.current?.getFen() ?? fen;
    if (!client || engineState !== "ready") return;

    const seq = ++analysisSeqRef.current;
    setAnalyzing(true);
    liveSeqRef.current++;
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    setAnalysisStale(false);
    setTopMoves([]);
    setCoachSan(null);
    setCoachNote(null);
    setBestIdea(null);
    setArrowUci({});

    try {
      const full = await client.analyzePosition(currentFen, {
        depth: 16,
        multipv: 3,
      });
      if (seq !== analysisSeqRef.current) return;

      const best = full.bestUci;
      const top = full.lines.find((l) => l.multipv === 1) ?? full.lines[0];
      const chess = new Chess(currentFen);
      const stm = chess.turn();
      const { cpWhite, mateWhite } = engineScoreToWhitePerspective(
        stm,
        top?.cp,
        top?.mate,
      );

      const nextEval: EvalSnapshot = { cpWhite, mateWhite, fen: currentFen };
      const blunderNow = computeBlunderFromEvalSwing(
        lastEvalSnapshotRef.current,
        nextEval,
      );
      setBlunderDetected(blunderNow);
      lastEvalSnapshotRef.current = nextEval;

      setEvalBar({ cpWhite, mateWhite });

      const top3 = full.lines
        .filter((l) => l.multipv >= 1 && l.multipv <= 3 && l.pvUci)
        .sort((a, b) => a.multipv - b.multipv)
        .slice(0, 3)
        .map((l): EngineTopMove => {
          const uci = l.pvUci.split(/\s+/)[0] ?? best;
          const w = engineScoreToWhitePerspective(stm, l.cp, l.mate);
          return {
            rank: l.multipv as 1 | 2 | 3,
            uci,
            san: uciToSan(currentFen, uci),
            evalLabel: formatWhiteEval(w.cpWhite, w.mateWhite),
          };
        });

      setTopMoves(top3);
      setBestIdea(
        best && top?.pvUci
          ? explainBestMoveIdea(currentFen, best, top.pvUci, cpWhite, mateWhite)
          : null,
      );

      setArrowUci({ bestUci: best, lineUcis: top3.map((t) => t.uci) });

      const allowCoach = isPastOpeningPhase(currentFen) || blunderNow;

      if (!allowCoach) {
        setCoachNote(
          `Opening phase (fullmove ≤ ${OPENING_MAX_FULLMOVE}): Elo-capped suggestions are off unless there’s a detected blunder.`,
        );
        return;
      }

      const coachUciRaw = await client.bestMoveAtElo(
        currentFen,
        stm === "w" ? whiteRating : blackRating,
        12,
      );
      if (seq !== analysisSeqRef.current) return;

      setCoachSan(uciToSan(currentFen, coachUciRaw));
      setArrowUci({
        bestUci: best,
        coachUci: coachUciRaw,
        lineUcis: top3.map((t) => t.uci),
      });

      const side = stm === "w" ? "White" : "Black";
      setCoachNote(
        `${side} to move. Full strength’s top line starts with ${uciToSan(currentFen, best) ?? best}. At the player rating, the “findable” move can differ: ${uciToSan(currentFen, coachUciRaw) ?? coachUciRaw}. Strongest arrow = engine best; lighter arrows = 2nd/3rd.`,
      );
    } catch {
      if (seq === analysisSeqRef.current) {
        setCoachNote(
          "Analysis failed (engine may still be busy). Try again in a moment.",
        );
      }
    } finally {
      if (seq === analysisSeqRef.current) setAnalyzing(false);
    }
  };

  const askThuggy = async () => {
    const client = engineRef.current;
    if (!client || engineState !== "ready") return;
    setThuggyBusy(true);
    try {
      const text = await answerThuggyBot({
        client,
        question: thuggyQuestion,
        currentFen: boardRef.current?.getFen() ?? fen,
        openingContext: openingInfo,
        whiteRating,
        blackRating,
      });
      setThuggyReply(text);
    } finally {
      setThuggyBusy(false);
    }
  };

  const currentMoveBadge: ChessBoardProps["moveBadge"] = useMemo(() => {
    if (gamePlyIndex <= 0) return null;
    const badgePly = Math.max(0, gamePlyIndex - 1);
    const item = gameAnalysis?.review?.[badgePly];
    const opening =
      badgePly === 0 || gameAnalysis?.moveInfo?.[badgePly]?.opening;
    if (!item) return null;

    type BK = NonNullable<ChessBoardProps["moveBadge"]>["kind"];
    let kind: BK | null = opening
      ? "theory"
      : item.verdict === "inaccuracy"
        ? "inaccuracy"
        : item.verdict === "blunder"
          ? "blunder"
          : item.verdict === "mistake"
            ? "mistake"
            : item.verdict === "missed win"
              ? "miss"
              : item.verdict === "brilliant"
                ? "brilliant"
                : item.playedSan === item.bestSan
                  ? "best"
                  : item.verdict === "excellent" || item.verdict === "good"
                    ? "good"
                    : null;

    if (!kind) return null;
    return { square: item.landedSquare, icon: "", kind };
  }, [gameAnalysis, gamePlyIndex]);

  const handleBoardMove = (m: GameMove) => {
    const hadReview = gameAnalysis != null;
    const ply = gamePlyIndex;
    const base = gameMoves.slice(0, ply);
    const oldTail = gameMoves.slice(ply);
    const nextMoves = [...base, m];
    const insertedPly = nextMoves.length - 1;
    const nextFen = reconstructFenForPly(
      gameInitialFen,
      nextMoves,
      nextMoves.length,
    );

    if (oldTail.length > 0) {
      setBranchesByPly((bprev) => {
        const existing = bprev[ply] ?? [];
        if (existing.some((t) => t[0]?.uci === oldTail[0]?.uci)) return bprev;
        return { ...bprev, [ply]: [...existing, oldTail] };
      });
    }

    setSelectedReviewPly(null);
    setGameMoves(nextMoves);
    setGamePlyIndex(ply + 1);
    boardRef.current?.setFen(nextFen);

    if (hadReview && engineRef.current) {
      void (async () => {
        const row = await analyzeNewMoveDuringReview(
          engineRef.current!,
          gameInitialFen,
          nextMoves,
          insertedPly,
        );
        if (!row) return;
        setGameAnalysis((prev) => {
          if (!prev) return prev;
          const moveInfo = prev.moveInfo.slice(0, insertedPly);
          const review = prev.review.slice(0, insertedPly);
          const evalSeries = prev.evalSeries.slice(0, insertedPly + 1);
          moveInfo[insertedPly] = row.rowMoveInfo;
          review[insertedPly] = row.rowReview;
          if (row.chosenWhiteRounded != null) {
            evalSeries[insertedPly + 1] = {
              cpWhite: row.chosenWhiteRounded,
              mateWhite: null,
            };
          }
          return { ...prev, moveInfo, review, evalSeries };
        });
      })();
    } else {
      setGameAnalysis(null);
    }
  };

  return (
    <div className="w-full max-w-5xl rounded-2xl border border-black/[0.06] bg-white/70 p-4 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-900/65 dark:ring-white/[0.05] md:p-8">
    <div className="flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-row items-start gap-2">
          <EvalBar
            cpWhite={evalBar?.cpWhite ?? null}
            mateWhite={evalBar?.mateWhite ?? null}
            whiteOnTop={boardOrientation === "black"}
          />
          <div className="relative">
            <ChessBoard
              ref={boardRef}
              onFenChange={onFenChange}
              onOrientationChange={setBoardOrientation}
              analysisArrows={arrowUci}
              moveBadge={currentMoveBadge}
              viewOnly={false}
              onMove={handleBoardMove}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <IconButton
            onClick={() => {
              if (gamePlyIndex > 0) stepToPly(gamePlyIndex - 1);
            }}
            label="Undo (step back)"
          >
            ↶
          </IconButton>
          <IconButton onClick={() => stepToPly(0)} label="Reset to start">
            ⟲
          </IconButton>
          <IconButton onClick={() => boardRef.current?.flip()} label="Flip board">
            ⇵
          </IconButton>
          <label className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white/90 px-3 py-2 text-sm shadow-sm dark:border-white/10 dark:bg-zinc-900/85">
            <input
              type="checkbox"
              checked={liveEnabled}
              onChange={(e) => {
                setLiveEnabled(e.target.checked);
                if (!e.target.checked) setEvalBar(null);
              }}
            />
            <span className="text-xs font-medium text-foreground/80">
              Live eval
            </span>
            {liveAnalyzing ? (
              <span className="text-[11px] text-foreground/50">(…)</span>
            ) : null}
          </label>
        </div>

        <div className="w-full max-w-md space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Moves
            </h3>
            <label className="flex items-center gap-2 text-xs text-foreground/75">
              <input
                type="checkbox"
                checked={showIcons}
                onChange={(e) => setShowIcons(e.target.checked)}
              />
              Icons
            </label>
          </div>

          {gameMoves.length === 0 ? (
            <p className="text-xs text-foreground/60">
              Play on the board or paste PGN/FEN below.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-foreground/60">Backtrack</p>
                <p className="text-xs font-mono text-foreground/75 tabular-nums">
                  move {Math.floor(gamePlyIndex / 2)} /{" "}
                  {Math.ceil(gameMoves.length / 2)} (←/→)
                </p>
              </div>
              {(() => {
                const ply = gamePlyIndex;
                const currentTail = gameMoves.slice(ply);
                const mainTail = mainlineMoves.slice(ply);
                const branchTails = branchesByPly[ply] ?? [];
                const all = [mainTail, currentTail, ...branchTails].filter(
                  (t) => t.length > 0,
                );
                const unique = all.filter(
                  (t, i) =>
                    all.findIndex((x) => x[0]?.uci === t[0]?.uci) === i,
                );
                if (unique.length <= 1) return null;
                const selected = branchChoiceByPly[ply] ?? 0;
                return (
                  <div className="rounded-md border border-black/10 bg-white/60 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-950/40">
                    <div className="mb-1 text-foreground/65">Continuation</div>
                    <div className="flex flex-wrap gap-1">
                      {unique.map((t, i) => (
                        <button
                          key={`${ply}-${t[0].uci}-${i}`}
                          type="button"
                          onClick={() =>
                            setBranchChoiceByPly((prev) => ({
                              ...prev,
                              [ply]: i,
                            }))
                          }
                          className={`rounded px-2 py-0.5 ${
                            selected === i
                              ? "bg-foreground text-background"
                              : "bg-zinc-200/70 text-foreground dark:bg-zinc-800"
                          }`}
                        >
                          {t[0]?.uci === mainTail[0]?.uci ? "Main" : `Branch ${i}`}{" "}
                          · {t[0].san}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="max-h-44 overflow-auto rounded-xl border border-black/[0.06] bg-white/60 p-2 dark:border-white/10">
                <div className="flex flex-col gap-1">
                  {Array.from({ length: Math.ceil(gameMoves.length / 2) }).map(
                    (_, mi) => {
                      const w = gameMoves[mi * 2];
                      const b = gameMoves[mi * 2 + 1];
                      const wIcon = gameAnalysis?.moveInfo[mi * 2]?.icon ?? null;
                      const bIcon =
                        gameAnalysis?.moveInfo[mi * 2 + 1]?.icon ?? null;
                      const highlight =
                        gamePlyIndex === mi * 2 + 1 ||
                        gamePlyIndex === mi * 2 + 2;

                      const iconClass = (icon: MoveIcon | null) =>
                        icon === "I"
                          ? "text-yellow-700 dark:text-yellow-400"
                          : icon === "M"
                            ? "text-amber-700 dark:text-amber-400"
                            : icon === "B"
                              ? "text-red-700 dark:text-red-400"
                              : icon === "X"
                                ? "text-pink-700 dark:text-pink-400"
                                : icon === "!!"
                                  ? "text-sky-700 dark:text-sky-400"
                                  : "text-foreground/50";
                      const showListIcon = (icon: MoveIcon | null) =>
                        icon === "I" ||
                        icon === "M" ||
                        icon === "B" ||
                        icon === "X" ||
                        icon === "!!";

                      return (
                        <div
                          key={`m-${mi}`}
                          className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs ${
                            highlight ? "bg-foreground/10" : "bg-transparent"
                          }`}
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            stepToPly(Math.min(gameMoves.length, mi * 2 + 2))
                          }
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-[11px] text-foreground/55">
                              {mi + 1}.
                            </span>{" "}
                            <span className="font-medium text-foreground/90">
                              {w?.san ?? "…"}
                            </span>{" "}
                            <span className="text-foreground/80">
                              {b?.san ?? ""}
                            </span>
                          </div>
                          {showIcons ? (
                            <span className="shrink-0 font-mono text-[11px] text-foreground/70">
                              <span className={iconClass(wIcon)}>
                                {showListIcon(wIcon) ? wIcon : ""}
                              </span>
                              <span className="px-1 text-foreground/40">|</span>
                              <span className={iconClass(bIcon)}>
                                {showListIcon(bIcon) ? bIcon : ""}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full max-w-md space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-foreground/60">
            FEN
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={fenField}
              onChange={(e) => setFenField(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-black/[0.08] bg-white/90 px-3 py-2 font-mono text-xs text-foreground shadow-sm dark:border-white/10 dark:bg-zinc-900/85"
              spellCheck={false}
            />
            <ToolButton className="shrink-0" onClick={applyFenInput}>
              Load
            </ToolButton>
            <ToolButton
              className="shrink-0"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fen);
                } catch {
                  /* ignore */
                }
              }}
            >
              Copy FEN
            </ToolButton>
          </div>
          {fenError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{fenError}</p>
          ) : null}
        </div>

      </div>

      <aside className="w-full flex-1 space-y-4 rounded-2xl border border-black/[0.06] bg-white/65 p-5 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-sm dark:border-white/[0.08] dark:bg-zinc-900/55 dark:ring-white/[0.05] lg:max-w-md">
        {openingInfo ? (
          <div className="rounded-xl border border-black/[0.06] bg-white/55 p-3 text-sm dark:border-white/10">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/55">
              Opening
            </p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/80">
              {openingInfo}
            </p>
          </div>
        ) : null}

        <div>
          <h2 className="text-sm font-semibold text-foreground">Coach</h2>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-foreground/55">
            Ratings
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <div className="text-xs text-foreground/70">White</div>
              <input
                type="number"
                inputMode="numeric"
                value={whiteRating}
                onChange={(e) => setWhiteRating(Number(e.target.value))}
                className="w-full rounded-xl border border-black/[0.06] bg-white/60 px-2 py-1.5 text-sm shadow-sm dark:border-white/10 dark:bg-zinc-950/40"
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs text-foreground/70">Black</div>
              <input
                type="number"
                inputMode="numeric"
                value={blackRating}
                onChange={(e) => setBlackRating(Number(e.target.value))}
                className="w-full rounded-xl border border-black/[0.06] bg-white/60 px-2 py-1.5 text-sm shadow-sm dark:border-white/10 dark:bg-zinc-950/40"
              />
            </label>
          </div>
        </div>

        {gameAnalysis?.review?.length ? (
          <div className="rounded-xl border border-black/[0.06] bg-white/55 p-3 text-sm dark:border-white/10">
            <div className="text-xs font-medium uppercase tracking-wide text-foreground/55">
              Move write-up
            </div>
            <p className="mt-1 text-xs text-foreground/65">
              Updates as you step through moves (←/→).
            </p>
            {(() => {
              const ply = selectedReviewPly ?? Math.max(0, gamePlyIndex - 1);
              const item = gameAnalysis.review[ply];
              if (!item) return null;
              const inBook = gameAnalysis.moveInfo[ply]?.opening;
              const findable =
                item.eloBestUci &&
                item.bestUci &&
                item.eloBestUci === item.bestUci
                  ? "easy to find"
                  : "tough to find";
              const verdictColor =
                item.verdict === "blunder"
                  ? "text-red-700 dark:text-red-400"
                  : item.verdict === "missed win"
                    ? "text-pink-700 dark:text-pink-400"
                    : item.verdict === "mistake"
                      ? "text-amber-700 dark:text-amber-400"
                      : item.verdict === "inaccuracy"
                        ? "text-yellow-700 dark:text-yellow-400"
                        : item.verdict === "brilliant"
                          ? "text-sky-700 dark:text-sky-400"
                          : item.verdict === "excellent"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-foreground/80";
              return (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-foreground/75">
                      move {item.moveNo} ({item.side})
                    </div>
                    <div className={`text-xs font-medium ${verdictColor}`}>
                      {item.verdict}
                    </div>
                  </div>
                  {inBook ? (
                    <p className="text-xs leading-relaxed text-foreground/75">
                      In opening book — detailed writeups start once the game is
                      out of book.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        {item.writeup}
                      </p>
                      {item.bestLineSans ? (
                        <p className="text-[11px] text-foreground/65">
                          Follow-up:{" "}
                          <span className="font-mono text-foreground/80">
                            {item.bestLineSans}
                          </span>
                          {item.eloBestUci ? (
                            <>
                              {" "}
                              <span className="text-foreground/50">·</span>{" "}
                              <span className="text-foreground/70">
                                {findable} at the player rating
                              </span>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        ) : null}

        {topMoves.length > 0 ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-foreground/60">Top 3 engine moves:</p>
            <ol className="list-decimal space-y-1 pl-5 text-foreground/85">
              {topMoves.map((m) => (
                <li key={m.rank} className="text-sm">
                  <span className="font-medium text-foreground">{m.rank}.</span>{" "}
                  {m.san ?? m.uci}{" "}
                  <span className="font-normal text-foreground/60">
                    ({m.evalLabel})
                  </span>
                </li>
              ))}
            </ol>
            {bestIdea ? (
              <p className="text-xs leading-relaxed text-foreground/75">
                {bestIdea}
              </p>
            ) : null}
            <div className="border-t border-black/10 pt-3 dark:border-white/10">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/55">
                Coaching move (rating-shaped)
              </p>
              <p className="mt-1 text-sm text-foreground">
                {allowCoachSuggestions ? (
                  <span className="font-medium">{coachSan ?? "—"}</span>
                ) : (
                  <span className="text-foreground/55">Skipped early opening</span>
                )}
              </p>
              {coachNote ? (
                <p className="mt-2 text-xs leading-relaxed text-foreground/70">
                  {coachNote}
                </p>
              ) : null}
            </div>
          </div>
        ) : coachNote ? (
          <p className="text-sm text-foreground/70">{coachNote}</p>
        ) : null}

        <div className="rounded-xl border border-black/[0.06] bg-gradient-to-b from-white/75 to-white/45 p-3 shadow-sm ring-1 ring-black/[0.03] dark:border-white/10 dark:from-zinc-900/65 dark:to-zinc-900/35 dark:ring-white/[0.04]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/55">
              ThuggyBot (2400)
            </p>
            <span className="text-[11px] text-foreground/55">notation or English</span>
          </div>
          <textarea
            value={thuggyQuestion}
            onChange={(e) => setThuggyQuestion(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs shadow-inner dark:border-white/10 dark:bg-zinc-950/60"
            placeholder="e.g. Why is …e5 inaccurate? What is White's plan?"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-foreground/55">
              Tuned to side-to-move rating.
            </span>
            <ToolButton
              onClick={() => void askThuggy()}
              disabled={
                thuggyBusy || engineState !== "ready" || !thuggyQuestion.trim()
              }
            >
              {thuggyBusy ? "Thinking…" : "Ask"}
            </ToolButton>
          </div>
          {thuggyReply ? (
            <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-foreground/85">
              {thuggyReply}
            </p>
          ) : null}
        </div>

        <div className="pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Game Analyzer</h2>
            <div className="text-xs text-foreground/60">PGN or FEN</div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-foreground/70">
              <input
                type="radio"
                name="gameInputMode"
                checked={gameInputMode === "PGN"}
                onChange={() => setGameInputMode("PGN")}
              />{" "}
              PGN
            </label>
            <label className="text-xs font-medium text-foreground/70">
              <input
                type="radio"
                name="gameInputMode"
                checked={gameInputMode === "FEN"}
                onChange={() => setGameInputMode("FEN")}
              />{" "}
              FEN
            </label>
          </div>

          <textarea
            value={gameInputText}
            onChange={(e) => setGameInputText(e.target.value)}
            placeholder={
              gameInputMode === "PGN" ? "Paste PGN…" : "Paste FEN…"
            }
            className="mt-3 min-h-24 w-full resize-y rounded-xl border border-black/[0.06] bg-white/60 p-2 font-mono text-[11px] shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/25 dark:border-white/10 dark:bg-zinc-950/40"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ToolButton
              onClick={() => {
                if (gameInputMode !== "FEN") return;
                const f = gameInputText.trim();
                if (!f) return;
                boardRef.current?.setFen(f);
                setGameInitialFen(f);
                setGameMoves([]);
                setMainlineMoves([]);
                setBranchesByPly({});
                setBranchChoiceByPly({});
                setGamePlyIndex(0);
                setGameAnalysis(null);
                setSelectedReviewPly(null);
                setGameInputText("");
              }}
              disabled={gameInputMode !== "FEN" || !gameInputText.trim()}
            >
              Load FEN
            </ToolButton>
            <ToolButton
              onClick={() => {
                if (gameInputMode !== "PGN") return;
                const pgn = gameInputText.trim();
                if (!pgn) return;
                const headers = pgn.match(/\[(\w+)\s+"([^"]*)"\]/g) ?? [];
                const headerMap: Record<string, string> = {};
                for (const h of headers) {
                  const m = h.match(/\[(\w+)\s+"([^"]*)"\]/);
                  if (m) headerMap[m[1]] = m[2];
                }
                const setUp =
                  headerMap["SetUp"] === "1" ||
                  headerMap["SetUp"]?.toLowerCase() === "true";
                const startFen =
                  setUp && headerMap["FEN"] ? headerMap["FEN"] : DEFAULT_POSITION;

                const chess = new Chess();
                chess.loadPgn(pgn, { strict: false });
                const hist = chess.history({ verbose: true });
                const moves: GameMove[] = hist.map((mv) => ({
                  uci: `${mv.from}${mv.to}${mv.promotion ?? ""}`,
                  san: mv.san,
                  color: mv.color as "w" | "b",
                }));

                setGameInitialFen(startFen);
                setGameMoves(moves);
                setMainlineMoves(moves);
                setBranchesByPly({});
                setBranchChoiceByPly({});
                setGamePlyIndex(0);
                setGameAnalysis(null);
                setSelectedReviewPly(null);
                setGameInputText("");
                boardRef.current?.setFen(startFen);
              }}
              disabled={gameInputMode !== "PGN" || !gameInputText.trim()}
            >
              Load PGN
            </ToolButton>
            <ToolButton onClick={runAnalysis} disabled={!analysisReady}>
              {analyzing ? "Analyzing…" : "Analyze"}
            </ToolButton>
            <ToolButton
              onClick={() => {
                void (async () => {
                  const client = engineRef.current;
                  if (!client || gameMoves.length === 0) return;
                  if (engineState !== "ready" || gameAnalyzing || liveAnalyzing)
                    return;

                  const seq = ++gameAnalysisSeqRef.current;
                  setGameAnalyzing(true);
                  setGameAnalysis(null);
                  setSelectedReviewPly(null);

                  try {
                    const result = await runFullGameReview({
                      client,
                      gameInitialFen,
                      gameMoves,
                      whiteRating,
                      blackRating,
                      seq,
                      seqRef: gameAnalysisSeqRef,
                    });
                    if (seq === gameAnalysisSeqRef.current) {
                      setGameAnalysis(result);
                    }
                  } catch {
                    /* invalid PGN line etc. */
                  } finally {
                    if (seq === gameAnalysisSeqRef.current) {
                      setGameAnalyzing(false);
                    }
                  }
                })();
              }}
              disabled={
                gameMoves.length === 0 ||
                gameAnalyzing ||
                engineState !== "ready" ||
                liveAnalyzing
              }
            >
              {gameAnalyzing ? "Reviewing…" : "Review Game"}
            </ToolButton>
          </div>
        </div>

        {gameAnalysis ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-white/55 p-3 dark:border-white/10">
              <div className="text-xs text-foreground/70">Accuracy</div>
              <div className="flex items-center gap-3 font-mono text-sm">
                <span>W {gameAnalysis.accuracyWhite}%</span>
                <span>B {gameAnalysis.accuracyBlack}%</span>
              </div>
            </div>

            <div className="rounded-xl border border-black/[0.06] bg-white/55 p-3 dark:border-white/10">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground/55">
                Eval fluctuations
              </div>
              <div className="mt-2">
                <EvalGraph
                  series={gameAnalysis.evalSeries}
                  onSelectPly={(ply) => stepToPly(ply + 1)}
                />
              </div>
            </div>

            <div className="rounded-xl border border-black/[0.06] bg-white/55 p-3 dark:border-white/10">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground/55">
                Missed moments
              </div>
              {gameAnalysis.missed.length === 0 ? (
                <p className="mt-2 text-xs text-foreground/70">None flagged.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {gameAnalysis.missed.slice(0, 10).map((m) => (
                    <div
                      key={m.ply}
                      className="flex items-start justify-between gap-2"
                    >
                      <div className="text-xs text-foreground/85">
                        {m.mover} <span className="font-medium">{m.move}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-foreground/70">
                          {m.difficulty}
                        </span>
                        <button
                          type="button"
                          className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] dark:border-white/10 dark:bg-zinc-900"
                          onClick={() => stepToPly(m.ply + 1)}
                        >
                          jump
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-black/[0.06] bg-white/55 p-3 dark:border-white/10">
              <div className="text-xs font-medium uppercase tracking-wide text-foreground/55">
                Critical moments
              </div>
              {gameAnalysis.critical.length === 0 ? (
                <p className="mt-2 text-xs text-foreground/70">None listed.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {gameAnalysis.critical.slice(0, 12).map((c) => (
                    <div
                      key={`${c.ply}-${c.tag}`}
                      className="flex items-start justify-between gap-2"
                    >
                      <div className="text-xs text-foreground/85">
                        move {c.moveNo} ({c.side}):{" "}
                        <span className="font-medium">{c.tag}</span> —{" "}
                        <span className="text-foreground/70">{c.note}</span>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] dark:border-white/10 dark:bg-zinc-900"
                        onClick={() => stepToPly(c.ply + 1)}
                      >
                        jump
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
    </div>
  );
}
