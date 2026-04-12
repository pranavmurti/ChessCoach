"use client";

import { useMemo, useState } from "react";

import { formatEvalBarLabel } from "@/lib/chessNotation";

export type EvalPoint = {
  cpWhite: number | null;
  mateWhite: number | null;
};

type Props = {
  series: EvalPoint[];
  width?: number;
  height?: number;
  onSelectPly?: (plyIndex: number) => void;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function toCpLike(p: EvalPoint): number {
  if (p.mateWhite != null) return p.mateWhite > 0 ? 10000 : -10000;
  return p.cpWhite ?? 0;
}

export function EvalGraph({
  series,
  width = 280,
  height = 90,
  onSelectPly,
}: Props) {
  const pad = 8;
  const midY = height / 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const laneH = innerH / 2;

  const values = useMemo(() => series.map(toCpLike), [series]);
  const maxAbs = useMemo(() => {
    const abs = values.map((v) => Math.abs(v));
    return Math.max(50, ...abs);
  }, [values]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const ptsWhite = useMemo(() => {
    if (!values.length) return "";
    return values
      .map((v, i) => {
        const x = pad + (i * innerW) / Math.max(1, values.length - 1);
        const y = pad + laneH * (1 - clamp(Math.max(0, v) / maxAbs, 0, 1));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [innerW, laneH, maxAbs, pad, values]);

  const ptsBlack = useMemo(() => {
    if (!values.length) return "";
    return values
      .map((v, i) => {
        const x = pad + (i * innerW) / Math.max(1, values.length - 1);
        const y =
          midY +
          laneH * clamp(Math.max(0, -v) / maxAbs, 0, 1); // down from midline
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [innerW, laneH, maxAbs, midY, pad, values]);

  const hover = hoverIdx != null ? series[hoverIdx] : null;
  const hoverX =
    hoverIdx != null
      ? pad + (hoverIdx * innerW) / Math.max(1, values.length - 1)
      : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const t = clamp((x - pad) / innerW, 0, 1);
    const idx = Math.round(t * Math.max(0, values.length - 1));
    setHoverIdx(idx);
  };

  const onClick = () => {
    if (hoverIdx == null) return;
    onSelectPly?.(hoverIdx);
  };

  const label =
    hover != null ? formatEvalBarLabel(hover.cpWhite, hover.mateWhite) : null;
  const hoverMoveNo =
    hoverIdx != null ? Math.floor(hoverIdx / 2) + 1 : null;
  const hoverSide =
    hoverIdx != null ? (hoverIdx % 2 === 0 ? "White" : "Black") : null;

  return (
    <div className="relative">
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] text-foreground/60">
        <span>White advantage</span>
        <span>Black advantage</span>
      </div>
      <svg
        width={width}
        height={height}
        className="block"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        onClick={onClick}
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
        />
        <line
          x1={pad}
          x2={width - pad}
          y1={midY}
          y2={midY}
          stroke="currentColor"
          strokeOpacity={0.4}
        />
        <text
          x={width - pad - 18}
          y={midY - 3}
          fontSize="10"
          fill="currentColor"
          opacity="0.55"
        >
          0.0
        </text>
        <polyline
          points={ptsWhite}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.9}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={ptsBlack}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.65}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hoverX != null ? (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={pad}
            y2={height - pad}
            stroke="currentColor"
            strokeOpacity={0.25}
          />
        ) : null}
      </svg>

      {hoverIdx != null && label ? (
        <div
          className="pointer-events-none absolute rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] font-mono text-foreground shadow-sm dark:border-white/10 dark:bg-zinc-950"
          style={{
            left: Math.min(width - 104, Math.max(0, (hoverX ?? 0) + 12)),
            top: 8,
          }}
        >
          <div>
            move {hoverMoveNo}
            {hoverSide ? ` (${hoverSide})` : ""}
          </div>
          <div>eval {label}</div>
        </div>
      ) : null}
    </div>
  );
}

