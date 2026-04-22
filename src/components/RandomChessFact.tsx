"use client";

import { useEffect, useState } from "react";

const FACTS = [
  "The number of legal chess positions is estimated to exceed 10^43.",
  "A knight on d4 controls 8 squares, its maximum reach on the board.",
  "In high-level games, many opening novelties come from engine prep at depth.",
  "Zugzwang is one of the rare ideas where having the move is a disadvantage.",
  "Rook endings are among the most common endgames in practical tournament play.",
  "The fifty-move rule can draw positions even when one side is materially ahead.",
  "Opposite-colored bishops often increase drawing chances unless kings are exposed.",
  "Tempo matters: one useful move can decide whether a tactic works.",
];

export function RandomChessFact() {
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    setFactIndex(Math.floor(Math.random() * FACTS.length));
  }, []);

  const fact = FACTS[factIndex] ?? FACTS[0];

  return (
    <div className="mt-4 rounded-xl border border-white/15 bg-black/20 p-4 text-sm leading-relaxed text-zinc-100/95">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">
        Chess Fact
      </p>
      <p className="mt-2">{fact}</p>
    </div>
  );
}

