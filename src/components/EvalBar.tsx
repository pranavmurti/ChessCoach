"use client";

import { formatEvalBarLabel } from "@/lib/chessNotation";

const BOARD_H = "min(90vmin, 560px)";

type Props = {
  cpWhite: number | null;
  mateWhite: number | null;
  /**
   * Whether White pieces are currently shown on the top edge of the board.
   * This is what the user expects to be aligned with the eval bar.
   */
  whiteOnTop: boolean;
};

function barFillRatio(cpWhite: number | null, mateWhite: number | null): number {
  let ratio = 0.5;
  if (mateWhite != null) {
    ratio = mateWhite > 0 ? 0.97 : mateWhite < 0 ? 0.03 : 0.5;
  } else if (cpWhite != null) {
    const t = Math.tanh(cpWhite / 380);
    ratio = 0.5 + 0.46 * t;
  }
  return ratio;
}

export function EvalBar({ cpWhite, mateWhite, whiteOnTop }: Props) {
  const ratio = barFillRatio(cpWhite, mateWhite);

  const label = formatEvalBarLabel(cpWhite, mateWhite);
  const hasData = cpWhite != null || mateWhite != null;

  return (
    <div
      className="flex shrink-0 flex-col items-center gap-1.5"
      aria-label={`Evaluation from White’s perspective: ${label}`}
    >
      <div
        className="relative w-7 overflow-hidden rounded-md border border-black/20 bg-zinc-950 shadow-inner dark:border-white/25"
        style={{ height: BOARD_H }}
      >
        <div className="absolute inset-0 bg-zinc-900" aria-hidden />
        {whiteOnTop ? (
          <div
            className="absolute left-0 right-0 top-0 bg-zinc-100 transition-[height] duration-500 ease-out dark:bg-zinc-200"
            style={{
              height: `${ratio * 100}%`,
              opacity: hasData ? 1 : 0.35,
            }}
          />
        ) : (
          <div
            className="absolute left-0 right-0 bottom-0 bg-zinc-100 transition-[height] duration-500 ease-out dark:bg-zinc-200"
            style={{
              height: `${ratio * 100}%`,
              opacity: hasData ? 1 : 0.35,
            }}
          />
        )}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/30 dark:bg-white/35"
          aria-hidden
        />
      </div>
      <div className="flex w-7 items-center justify-between px-0.5 text-[10px] font-medium leading-none text-foreground/60 tabular-nums">
        <span>{whiteOnTop ? "W" : "B"}</span>
        <span>{whiteOnTop ? "B" : "W"}</span>
      </div>
      <span
        className="max-w-[2.5rem] text-center font-mono text-[10px] leading-tight tracking-tight text-foreground/75 tabular-nums"
        title={hasData ? undefined : "Analyze a position to see the eval"}
      >
        {label}
      </span>
    </div>
  );
}
