"use client";

import type { Key } from "@lichess-org/chessground/types";
import { Chess, type Square } from "chess.js";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ChessBoard,
  type ChessBoardHandle,
  type ChessBoardProps,
} from "@/components/ChessBoard";

export type TrainerQueueItem = {
  startFen: string;
  /** Space-separated engine PV from the puzzle root; you play your-side plies, we auto-play the rest. */
  pvUci: string;
  label: string;
};

function parsePvUci(pv: string): string[] {
  return pv.trim().split(/\s+/).filter(Boolean);
}

function fenAfterPlies(
  startFen: string,
  tokens: string[],
  count: number,
): string | null {
  let fen = startFen;
  for (let i = 0; i < count; i++) {
    const uci = tokens[i];
    if (!uci) return null;
    const c = new Chess(fen);
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promo = uci[4]?.toLowerCase();
    const p =
      promo && ["q", "r", "b", "n"].includes(promo)
        ? (promo as "q" | "r" | "b" | "n")
        : undefined;
    const m = c.move({ from, to, promotion: p });
    if (!m) return null;
    fen = c.fen();
  }
  return fen;
}

/** Board POV for the whole puzzle: the human side at the root position stays at the bottom. */
function userPovFromRoot(startFen: string): "white" | "black" {
  return new Chess(startFen).turn() === "b" ? "black" : "white";
}

function uciToLastMove(uci: string): [Key, Key] | undefined {
  if (uci.length < 4) return undefined;
  return [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];
}

/** Same resulting position as engine line (handles promotion letter case). */
export function movesMatch(
  fen: string,
  playedUci: string,
  targetUci: string,
): boolean {
  const norm = (u: string) => u.toLowerCase().trim();
  const a = norm(playedUci);
  const b = norm(targetUci);
  if (a === b) return true;
  const resultingFen = (uci: string): string | null => {
    const c = new Chess(fen);
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promo = uci[4]?.toLowerCase();
    const p =
      promo && ["q", "r", "b", "n"].includes(promo)
        ? (promo as "q" | "r" | "b" | "n")
        : undefined;
    const m = c.move({ from, to, promotion: p });
    return m ? c.fen() : null;
  };
  const fa = resultingFen(a);
  const fb = resultingFen(b);
  return fa != null && fb != null && fa === fb;
}

type Props = {
  queue: TrainerQueueItem[];
  onSessionComplete: () => void;
  inline?: boolean;
};

/** Chessground slide duration for those moves (keep ≤ step so moves don’t overlap). */
const MOVE_ANIM_MS = 620;

export function PatternTrainer({ queue, onSessionComplete, inline = false }: Props) {
  const boardRef = useRef<ChessBoardHandle>(null);
  const [playIndex, setPlayIndex] = useState(0);
  const [moveBadge, setMoveBadge] = useState<ChessBoardProps["moveBadge"]>(null);
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [solutionStepping, setSolutionStepping] = useState(false);
  const [puzzleCompleted, setPuzzleCompleted] = useState(false);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    () => (queue[0] ? userPovFromRoot(queue[0].startFen) : "white"),
  );
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const playIndexRef = useRef(playIndex);
  playIndexRef.current = playIndex;
  const appliedPliesRef = useRef(0);
  const feedbackLockRef = useRef(false);
  useEffect(() => {
    setSolutionStepping(false);
    setPuzzleCompleted(false);
  }, [playIndex, queue]);

  useEffect(() => {
    if (!queue.length) return;
    const item = queue[playIndex];
    if (!item) return;
    feedbackLockRef.current = true;
    appliedPliesRef.current = 0;
    setHintSquare(null);
    setBoardOrientation(userPovFromRoot(item.startFen));
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        boardRef.current?.setFen(item.startFen);
        setMoveBadge(null);
        setPuzzleCompleted(false);
        feedbackLockRef.current = false;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [queue, playIndex]);

  const advanceQueue = useCallback(() => {
    const q = queueRef.current;
    const idx = playIndexRef.current;
    const next = idx + 1;
    appliedPliesRef.current = 0;
    if (next < q.length) {
      setPlayIndex(next);
    } else {
      feedbackLockRef.current = false;
      onSessionComplete();
    }
  }, [onSessionComplete]);

  const stepToPly = useCallback((next: number) => {
    const item = queueRef.current[playIndexRef.current];
    if (!item) return;
    const tokens = parsePvUci(item.pvUci);
    const clamped = Math.max(0, Math.min(tokens.length, next));
    const fen = fenAfterPlies(item.startFen, tokens, clamped);
    if (!fen) return;
    const uci = clamped > 0 ? tokens[clamped - 1] : undefined;
    const lm = uci ? uciToLastMove(uci) : undefined;
    boardRef.current?.setFen(fen, {
      animate: true,
      lastMove: lm,
      animationDurationMs: MOVE_ANIM_MS,
    });
    appliedPliesRef.current = clamped;
    setHintSquare(null);
  }, []);

  const stepForward = useCallback(() => {
    if (feedbackLockRef.current || solutionStepping || puzzleCompleted) return;
    const item = queueRef.current[playIndexRef.current];
    if (!item) return;
    const tokens = parsePvUci(item.pvUci);
    const k = appliedPliesRef.current;
    if (k >= tokens.length) return;
    setSolutionStepping(true);
    feedbackLockRef.current = true;
    stepToPly(k + 1);
    window.setTimeout(() => {
      const afterFirst = appliedPliesRef.current;
      const canAutoReply =
        // Root is user's move, so even ply-count means user's turn.
        k % 2 === 0 &&
        afterFirst < tokens.length;
      if (canAutoReply) {
        stepToPly(afterFirst + 1);
        window.setTimeout(() => {
          setSolutionStepping(false);
          if (appliedPliesRef.current >= tokens.length) {
            setPuzzleCompleted(true);
            feedbackLockRef.current = false;
          } else {
            feedbackLockRef.current = false;
          }
        }, MOVE_ANIM_MS + 80);
        return;
      }
      setSolutionStepping(false);
      feedbackLockRef.current = false;
      if (appliedPliesRef.current >= tokens.length) {
        setPuzzleCompleted(true);
        feedbackLockRef.current = false;
      }
    }, MOVE_ANIM_MS + 80);
  }, [puzzleCompleted, solutionStepping, stepToPly]);

  const stepBack = useCallback(() => {
    if (feedbackLockRef.current || solutionStepping || puzzleCompleted) return;
    const k = appliedPliesRef.current;
    if (k <= 0) return;
    setSolutionStepping(true);
    feedbackLockRef.current = true;
    stepToPly(k - 1);
    window.setTimeout(() => {
      setSolutionStepping(false);
      feedbackLockRef.current = false;
    }, MOVE_ANIM_MS + 80);
  }, [puzzleCompleted, solutionStepping, stepToPly]);

  const playSolution = useCallback(() => {
    stepForward();
  }, [stepForward]);

  const toggleHint = useCallback(() => {
    if (feedbackLockRef.current || solutionStepping || puzzleCompleted) return;
    const item = queueRef.current[playIndexRef.current];
    if (!item) return;
    const tokens = parsePvUci(item.pvUci);
    const k = appliedPliesRef.current;
    const uci = tokens[k];
    if (!uci) return;
    const from = uci.slice(0, 2);
    setHintSquare((prev) => (prev === from ? null : from));
  }, [puzzleCompleted, solutionStepping]);

  const handleBoardMove = useCallback(
    (m: { uci: string; san: string; color: "w" | "b" }) => {
      if (feedbackLockRef.current) return;
      const q = queueRef.current;
      const idx = playIndexRef.current;
      const item = q[idx];
      if (!item) return;

      const tokens = parsePvUci(item.pvUci);
      if (!tokens.length) {
        return;
      }

      const k = appliedPliesRef.current;
      const fenAtStep = fenAfterPlies(item.startFen, tokens, k);
      const expected = tokens[k];
      if (!fenAtStep || !expected) {
        return;
      }

      setHintSquare(null);
      feedbackLockRef.current = true;
      const destSquare = m.uci.slice(2, 4);
      const ok = movesMatch(fenAtStep, m.uci, expected);

      if (ok) {
        appliedPliesRef.current = k + 1;
        setMoveBadge({
          square: destSquare,
          icon: "",
          kind: "puzzle_correct",
        });
        window.setTimeout(() => {
          setMoveBadge(null);
          const cur = queueRef.current[playIndexRef.current];
          if (!cur) {
            feedbackLockRef.current = false;
            return;
          }
          const t = parsePvUci(cur.pvUci);
          const afterUser = appliedPliesRef.current;
          if (afterUser >= t.length) {
            setPuzzleCompleted(true);
            feedbackLockRef.current = false;
            return;
          }
          // Auto-play opponent reply, then pause on user's next move.
          const afterOpp = afterUser + 1;
          const nextFen = fenAfterPlies(cur.startFen, t, afterOpp);
          if (!nextFen) {
            feedbackLockRef.current = false;
            return;
          }
          appliedPliesRef.current = afterOpp;
          const oppUci = t[afterUser];
          const lm = oppUci ? uciToLastMove(oppUci) : undefined;
          boardRef.current?.setFen(nextFen, {
            animate: true,
            lastMove: lm,
            animationDurationMs: MOVE_ANIM_MS,
          });

          if (afterOpp >= t.length) {
            window.setTimeout(() => {
              setPuzzleCompleted(true);
              feedbackLockRef.current = false;
            }, MOVE_ANIM_MS + 80);
          } else {
            window.setTimeout(() => {
              feedbackLockRef.current = false;
            }, MOVE_ANIM_MS + 80);
          }
        }, 850);
      } else {
        setMoveBadge({
          square: destSquare,
          icon: "",
          kind: "puzzle_wrong",
        });
        window.setTimeout(() => {
          boardRef.current?.undo();
          setMoveBadge(null);
          feedbackLockRef.current = false;
        }, 900);
      }
    },
    [puzzleCompleted],
  );

  if (!queue.length) return null;

  const current = queue[playIndex];
  if (!current) return null;

  const tokens = parsePvUci(current.pvUci);
  const canAssist = tokens.length > 0 && !solutionStepping;
  const canBack = canAssist && appliedPliesRef.current > 0;
  const canForward = canAssist && appliedPliesRef.current < tokens.length;
  const hasNextPuzzle = playIndex + 1 < queue.length;

  return (
    <section
      className={`rounded-2xl border border-black/[0.06] bg-white/85 p-5 shadow-md ring-1 ring-black/[0.04] backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-900/85 dark:ring-white/[0.06] ${
        inline ? "mt-3" : "sticky top-4 z-10"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Train on board
          </h2>
          <p className="mt-0.5 text-xs text-foreground/65">
            {current.label}
          </p>
          <p className="mt-1 text-[11px] text-foreground/50">
            {playIndex + 1} / {queue.length} — your color stays at the bottom for
            the whole puzzle; play each best move in the engine line; after you
            find it, the opponent reply is animated on the board until the line
            ends.
          </p>
        </div>
        <button
          type="button"
          onClick={onSessionComplete}
          className="shrink-0 rounded-xl border border-black/[0.08] px-3 py-1.5 text-xs font-medium text-foreground/85 transition hover:bg-black/[0.04] dark:border-white/10 dark:hover:bg-white/[0.06]"
        >
          End session
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleHint}
          disabled={!canAssist}
          aria-pressed={hintSquare != null}
          className="rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-400/35 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/50"
        >
          {hintSquare != null ? "Hide hint" : "Hint"}
        </button>
        <button
          type="button"
          onClick={playSolution}
          disabled={!canAssist}
          className="rounded-xl border border-sky-500/40 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-950 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-400/35 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/50"
        >
          Solution (next move)
        </button>
        <button
          type="button"
          onClick={stepBack}
          disabled={!canBack}
          className="rounded-xl border border-black/[0.12] bg-white px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-zinc-900 dark:hover:bg-white/[0.06]"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={stepForward}
          disabled={!canForward || puzzleCompleted}
          className="rounded-xl border border-black/[0.12] bg-white px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-zinc-900 dark:hover:bg-white/[0.06]"
        >
          Forward →
        </button>
      </div>
      {puzzleCompleted ? (
        <div className="mb-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          <div className="font-semibold">✓ Completed!</div>
          <div className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-300/90">
            You finished this puzzle line.
          </div>
          <div className="mt-2 flex gap-2">
            {hasNextPuzzle ? (
              <button
                type="button"
                onClick={advanceQueue}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                Next puzzle →
              </button>
            ) : (
              <button
                type="button"
                onClick={onSessionComplete}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                Finish session
              </button>
            )}
          </div>
        </div>
      ) : null}
      <p className="mb-2 text-[10px] text-foreground/45">
        Hint highlights the piece to move. Solution reveals one move at a time.
        Use Back/Forward arrows to step through the line manually.
      </p>

      <div className="mx-auto flex max-w-[min(90vmin,560px)] justify-center">
        <ChessBoard
          ref={boardRef}
          viewOnly={solutionStepping}
          onMove={handleBoardMove}
          moveBadge={moveBadge}
          boardOrientation={boardOrientation}
          hintSquare={hintSquare}
          onArrowNavigate={(dir) => {
            if (dir === "back") stepBack();
            else stepForward();
          }}
        />
      </div>
    </section>
  );
}
