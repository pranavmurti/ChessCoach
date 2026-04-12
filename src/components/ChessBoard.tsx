"use client";

import { Chessground } from "@lichess-org/chessground";
import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { Chess, validateFen, type Square } from "chess.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

type CgApi = ReturnType<typeof Chessground>;

const PROMO_ROLES = [
  { p: "q" as const, label: "Queen" },
  { p: "r" as const, label: "Rook" },
  { p: "b" as const, label: "Bishop" },
  { p: "n" as const, label: "Knight" },
];

export type SetFenOptions = {
  /** Use Chessground piece animation instead of an instant jump. */
  animate?: boolean;
  /** Squares for last-move highlight; helps animation match the intended move. */
  lastMove?: [Key, Key];
  /** Milliseconds; clamped to ≥70 in Chessground. Default 600 when `animate` is true. */
  animationDurationMs?: number;
};

export type ChessBoardHandle = {
  getFen: () => string;
  getOrientation: () => "white" | "black";
  setFen: (fen: string, opts?: SetFenOptions) => boolean;
  undo: () => boolean;
  reset: () => void;
  flip: () => void;
};

export type ChessBoardProps = {
  onFenChange?: (fen: string) => void;
  onMove?: (move: { uci: string; san: string; color: "w" | "b" }) => void;
  onOrientationChange?: (orientation: "white" | "black") => void;
  viewOnly?: boolean;
  analysisArrows?: {
    bestUci?: string | null;
    coachUci?: string | null;
    lineUcis?: string[];
  };
  moveBadge?: {
    square: string;
    icon: string;
    kind:
      | "theory"
      | "inaccuracy"
      | "mistake"
      | "blunder"
      | "miss"
      | "best"
      | "good"
      | "brilliant"
      | "puzzle_correct"
      | "puzzle_wrong";
  } | null;
  /** Your pieces at the bottom: Black to move → black on bottom. */
  boardOrientation?: "white" | "black";
  /** Highlight this square (e.g. piece to move for a puzzle hint). */
  hintSquare?: string | null;
};

function legalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  if (chess.isGameOver()) return dests;
  for (const m of chess.moves({ verbose: true })) {
    const from = m.from as Key;
    const to = m.to as Key;
    const list = dests.get(from);
    if (list) list.push(to);
    else dests.set(from, [to]);
  }
  return dests;
}

function uciToShape(uci: string, brush: string): DrawShape | null {
  if (uci.length < 4) return null;
  return {
    orig: uci.slice(0, 2) as Key,
    dest: uci.slice(2, 4) as Key,
    brush,
  };
}

function applyGround(
  api: CgApi,
  chess: Chess,
  lastMove: [Key, Key] | undefined,
  viewOnly: boolean,
  badge: ChessBoardProps["moveBadge"] | null | undefined,
  hintSquare: string | null | undefined,
  animationDuration?: number,
) {
  const turn = chess.turn() === "w" ? "white" : "black";
  const checkColor = chess.isCheck() ? turn : undefined;
  const over = chess.isGameOver();
  const custom = new Map<Key, string>();
  if (badge) {
    custom.set(
      badge.square as Key,
      `move-badge move-badge-${badge.kind}`,
    );
  }
  if (hintSquare) {
    const hk = hintSquare as Key;
    const prev = custom.get(hk);
    custom.set(
      hk,
      prev ? `${prev} trainer-hint` : "trainer-hint",
    );
  }
  const payload: Parameters<CgApi["set"]>[0] = {
    fen: chess.fen(),
    turnColor: turn,
    lastMove,
    highlight: {
      lastMove: true,
      check: true,
      custom,
    },
    draggable: { enabled: !viewOnly },
    movable: over
      ? { color: undefined, dests: new Map() }
      : viewOnly
        ? { color: undefined, dests: new Map() }
        : {
            color: turn,
            free: false,
            dests: legalDests(chess),
          },
    check: checkColor,
  };
  if (animationDuration != null && animationDuration >= 70) {
    payload.animation = { enabled: true, duration: animationDuration };
  }
  api.set(payload);
}

export const ChessBoard = forwardRef<ChessBoardHandle, ChessBoardProps>(
  function ChessBoard(
    {
      onFenChange,
      onOrientationChange,
      onMove,
      viewOnly = false,
      analysisArrows,
      moveBadge,
      boardOrientation,
      hintSquare,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const chessRef = useRef(new Chess());
    const apiRef = useRef<CgApi | null>(null);
    const hintSquareRef = useRef(hintSquare);
    hintSquareRef.current = hintSquare;
    const moveBadgeRef = useRef(moveBadge);
    moveBadgeRef.current = moveBadge;
    const viewOnlyRef = useRef(viewOnly);
    viewOnlyRef.current = viewOnly;
    const boardOrientationPropRef = useRef(boardOrientation);
    boardOrientationPropRef.current = boardOrientation;
    const onFenChangeRef = useRef(onFenChange);
    onFenChangeRef.current = onFenChange;
    const onOrientationChangeRef = useRef(onOrientationChange);
    onOrientationChangeRef.current = onOrientationChange;
    const onMoveRef = useRef(onMove);
    onMoveRef.current = onMove;

    const [promote, setPromote] = useState<{
      orig: Key;
      dest: Key;
    } | null>(null);
    const [groundReady, setGroundReady] = useState(0);

    useImperativeHandle(ref, () => ({
      getFen: () => chessRef.current.fen(),
      getOrientation: () => apiRef.current?.state.orientation ?? "white",
      setFen: (fen: string, opts?: SetFenOptions) => {
        const api = apiRef.current;
        if (!api) return false;
        const v = validateFen(fen);
        if (!v.ok) return false;
        chessRef.current.load(fen);
        setPromote(null);
        const animate = opts?.animate === true;
        const lastMove = animate ? opts?.lastMove : undefined;
        const animationDuration = animate
          ? Math.max(70, opts?.animationDurationMs ?? 600)
          : undefined;
        applyGround(
          api,
          chessRef.current,
          lastMove,
          viewOnlyRef.current,
          moveBadgeRef.current,
          hintSquareRef.current,
          animationDuration,
        );
        onFenChangeRef.current?.(chessRef.current.fen());
        return true;
      },
      undo: () => {
        const api = apiRef.current;
        if (!api) return false;
        const undone = chessRef.current.undo();
        if (!undone) return false;
        setPromote(null);
        applyGround(
          api,
          chessRef.current,
          undefined,
          viewOnlyRef.current,
          moveBadgeRef.current,
          hintSquareRef.current,
          undefined,
        );
        onFenChangeRef.current?.(chessRef.current.fen());
        return true;
      },
      reset: () => {
        const api = apiRef.current;
        if (!api) return;
        chessRef.current.reset();
        setPromote(null);
        applyGround(
          api,
          chessRef.current,
          undefined,
          viewOnlyRef.current,
          moveBadgeRef.current,
          hintSquareRef.current,
          undefined,
        );
        onFenChangeRef.current?.(chessRef.current.fen());
      },
      flip: () => {
        const api = apiRef.current;
        if (!api) return;
        api.toggleOrientation();
        onOrientationChangeRef.current?.(api.state.orientation);
      },
    }));

    useEffect(() => {
      const api = apiRef.current;
      if (!api) return;
      const chess = chessRef.current;
      const shapes: DrawShape[] = [];
      const best = analysisArrows?.bestUci;
      const coach = analysisArrows?.coachUci;
      const lines = analysisArrows?.lineUcis ?? [];
      if (lines.length > 0) {
        const brushes = ["bestBlue", "altBlue2", "altBlue3"];
        for (let i = 0; i < Math.min(3, lines.length); i++) {
          const s = uciToShape(lines[i], brushes[i]);
          if (s) shapes.push(s);
        }
      } else {
        if (best) {
          const s = uciToShape(best, "bestBlue");
          if (s) shapes.push(s);
        }
        if (coach && coach !== best) {
          const s = uciToShape(coach, "altBlue2");
          if (s) shapes.push(s);
        }
      }
      api.setAutoShapes(shapes);
      applyGround(
        api,
        chess,
        undefined,
        viewOnly,
        moveBadgeRef.current,
        hintSquareRef.current,
        undefined,
      );
    }, [analysisArrows, groundReady, moveBadge, viewOnly, hintSquare]);

    useEffect(() => {
      const api = apiRef.current;
      if (!api || boardOrientation == null) return;
      api.set({ orientation: boardOrientation });
      onOrientationChangeRef.current?.(boardOrientation);
    }, [boardOrientation, groundReady]);

    useEffect(() => {
      const el = hostRef.current;
      if (!el) return;

      const notify = () => {
        onFenChangeRef.current?.(chessRef.current.fen());
      };

      const chess = chessRef.current;
      const api = Chessground(el, {
        fen: chess.fen(),
        orientation: boardOrientationPropRef.current ?? "white",
        movable: {
          color: "white",
          free: false,
          dests: legalDests(chess),
          events: {
            after: (orig, dest) => {
              const from = orig as Square;
              const to = dest as Square;
              const candidates = chess
                .moves({ square: from, verbose: true })
                .filter((m) => m.to === to);

              if (!candidates.length) {
                applyGround(
                  api,
                  chess,
                  undefined,
                  viewOnlyRef.current,
                  moveBadgeRef.current,
                  hintSquareRef.current,
                  undefined,
                );
                return;
              }

              if (candidates.length > 1) {
                setPromote({ orig, dest });
                applyGround(
                  api,
                  chess,
                  undefined,
                  viewOnlyRef.current,
                  moveBadgeRef.current,
                  hintSquareRef.current,
                  undefined,
                );
                return;
              }

              const m = candidates[0];
              const ok = chess.move({
                from: m.from,
                to: m.to,
                promotion: m.promotion,
              });
              if (!ok) {
                applyGround(
                  api,
                  chess,
                  undefined,
                  viewOnlyRef.current,
                  moveBadgeRef.current,
                  hintSquareRef.current,
                  undefined,
                );
                return;
              }
              applyGround(
                api,
                chess,
                [orig, dest] as [Key, Key],
                viewOnlyRef.current,
                moveBadgeRef.current,
                hintSquareRef.current,
                undefined,
              );
              notify();

              const last = chess.history({ verbose: true }).at(-1);
              if (last) {
                const promotion = last.promotion ?? "";
                const uci = `${orig}${dest}${promotion ? String(promotion) : ""}`;
                onMoveRef.current?.({
                  uci,
                  san: last.san,
                  color: last.color as "w" | "b",
                });
              }
            },
          },
        },
        draggable: { enabled: !viewOnly },
        drawable: {
          enabled: true,
          visible: true,
          brushes: {
            green: { key: "g", color: "#15781B", opacity: 1, lineWidth: 10 },
            red: { key: "r", color: "#882020", opacity: 1, lineWidth: 10 },
            blue: { key: "b", color: "#003088", opacity: 1, lineWidth: 10 },
            yellow: { key: "y", color: "#e68f00", opacity: 1, lineWidth: 10 },
            bestBlue: {
              key: "bestBlue",
              color: "#2563eb",
              opacity: 0.95,
              lineWidth: 12,
            },
            altBlue2: {
              key: "altBlue2",
              color: "#60a5fa",
              opacity: 0.6,
              lineWidth: 8,
            },
            altBlue3: {
              key: "altBlue3",
              color: "#93c5fd",
              opacity: 0.4,
              lineWidth: 6,
            },
          },
        },
      });
      apiRef.current = api;
      setGroundReady((n) => n + 1);
      notify();

      // Clear memoized board bounds before Chessground handles the event.
      // Do NOT call api.redrawAll() here: in Chessground 10 it rebuilds the
      // whole DOM (innerHTML = '') and runs after mousedown/pointerdown bubble,
      // which destroys pieces mid-drag and makes the board feel "stuck".
      const refreshBounds = () => {
        api.state.dom.bounds.clear();
      };
      const refreshOpts = { capture: true, passive: true } as const;
      el.addEventListener("pointerdown", refreshBounds, refreshOpts);
      el.addEventListener("mousedown", refreshBounds, refreshOpts);
      el.addEventListener("touchstart", refreshBounds, refreshOpts);

      const onResize = () => {
        api.redrawAll();
      };
      window.addEventListener("resize", onResize);
      const ro =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => {
              api.redrawAll();
            })
          : null;
      ro?.observe(el);

      return () => {
        el.removeEventListener("pointerdown", refreshBounds, refreshOpts);
        el.removeEventListener("mousedown", refreshBounds, refreshOpts);
        el.removeEventListener("touchstart", refreshBounds, refreshOpts);
        window.removeEventListener("resize", onResize);
        ro?.disconnect();
        api.destroy();
        apiRef.current = null;
      };
    }, []);

    const finishPromotion = (piece: "q" | "r" | "b" | "n") => {
      if (!promote) return;
      const api = apiRef.current;
      const chess = chessRef.current;
      if (!api) return;
      const { orig, dest } = promote;
      const ok = chess.move({
        from: orig as Square,
        to: dest as Square,
        promotion: piece,
      });
      setPromote(null);
      if (!ok) {
        applyGround(
          api,
          chess,
          undefined,
          viewOnlyRef.current,
          moveBadgeRef.current,
          hintSquareRef.current,
          undefined,
        );
        return;
      }
      applyGround(
        api,
        chess,
        [orig, dest] as [Key, Key],
        viewOnlyRef.current,
        moveBadgeRef.current,
        hintSquareRef.current,
        undefined,
      );
      onFenChangeRef.current?.(chess.fen());

      const last = chess.history({ verbose: true }).at(-1);
      if (last) {
        const promotion = last.promotion ?? "";
        const uci = `${orig}${dest}${promotion ? String(promotion) : ""}`;
        onMoveRef.current?.({
          uci,
          san: last.san,
          color: last.color as "w" | "b",
        });
      }
    };

    return (
      <div className="flex flex-col items-center gap-2">
        <div
          ref={hostRef}
          className="cg-wrap rounded-sm shadow-lg ring-1 ring-black/10 dark:ring-white/10"
          style={{
            width: "min(90vmin, 560px)",
            height: "min(90vmin, 560px)",
          }}
        />
        {promote ? (
          <div
            className="flex flex-wrap justify-center gap-2 rounded-lg border border-black/10 bg-zinc-50 px-3 py-2 dark:border-white/15 dark:bg-zinc-900"
            role="group"
            aria-label="Choose promotion piece"
          >
            {PROMO_ROLES.map(({ p, label }) => (
              <button
                key={p}
                type="button"
                onClick={() => finishPromotion(p)}
                className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-foreground hover:bg-zinc-100 dark:border-white/15 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);

ChessBoard.displayName = "ChessBoard";
