import Link from "next/link";

import { RandomChessFact } from "@/components/RandomChessFact";
import { SitePageShell } from "@/components/SitePageShell";

export default function HomePage() {
  return (
    <SitePageShell paddingClass="pb-16 pt-10 md:pb-24 md:pt-14">
      <section className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-3xl border border-black/[0.08] bg-white/75 p-7 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-sm dark:border-white/[0.1] dark:bg-zinc-900/70 dark:ring-white/[0.08] md:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
            Opening prep · Tactics · Endgame conversion
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:leading-[1.08]">
            Turn every game into targeted chess training
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-foreground/70 md:text-lg">
            Analyze your board with Stockfish, review mistakes move-by-move, and
            drill recurring patterns from your own games. Focus on plans you can
            actually play over the board.
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              href="/coach"
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-indigo-50 shadow-lg shadow-indigo-900/20 transition hover:bg-indigo-500 dark:bg-indigo-500 dark:text-indigo-50 dark:hover:bg-indigo-400"
            >
              Open board &amp; analyze
            </Link>
            <Link
              href="/patterns"
              className="inline-flex items-center justify-center rounded-xl border border-indigo-700/25 bg-indigo-50/80 px-7 py-3.5 text-sm font-semibold text-indigo-900 backdrop-blur-sm transition hover:bg-indigo-50 dark:border-indigo-300/25 dark:bg-zinc-900/85 dark:text-indigo-100 dark:hover:bg-zinc-800"
            >
              Train my patterns
            </Link>
          </div>
        </div>

        <aside className="relative overflow-hidden rounded-3xl border border-black/[0.08] bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 p-6 text-zinc-100 shadow-sm ring-1 ring-black/[0.08] dark:border-white/[0.08] md:p-7">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-300/20 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-violet-200/10 blur-2xl" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
            Position Focus
          </p>
          <div className="hero-piece-shell mx-auto mt-4 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-amber-100/30 to-stone-100/10 backdrop-blur">
            <span className="hero-piece text-6xl leading-none" aria-hidden>
              ♞
            </span>
          </div>
          <p className="mt-2 text-center text-[11px] uppercase tracking-[0.16em] text-cyan-200/90">
            Knight Patrol
          </p>
          <RandomChessFact />
        </aside>
      </section>

      <div className="mx-auto mt-10 grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="group rounded-2xl border border-black/[0.07] bg-white/70 p-6 shadow-sm backdrop-blur-sm transition hover:border-sky-500/25 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900/60 dark:hover:border-sky-400/20">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-lg dark:bg-sky-400/20">
            ♟
          </div>
          <h2 className="mt-4 text-sm font-semibold text-foreground">
            Live analyze
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/65">
            Interactive board, eval bar, and multi-PV lines as you explore
            tactical and strategic choices.
          </p>
          <Link
            href="/coach"
            className="mt-4 inline-flex text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            Start analyzing →
          </Link>
        </article>

        <article className="group rounded-2xl border border-black/[0.07] bg-white/70 p-6 shadow-sm backdrop-blur-sm transition hover:border-violet-500/25 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900/60 dark:hover:border-violet-400/20">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-lg dark:bg-violet-400/20">
            <span aria-hidden>🔍</span>
            <span
              aria-hidden
              className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 text-[9px] leading-none"
            >
              ♟
            </span>
          </div>
          <h2 className="mt-4 text-sm font-semibold text-foreground">
            Full game review
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/65">
            Paste PGN, step through move quality tags, and inspect eval graph
            inflection points.
          </p>
          <Link
            href="/coach"
            className="mt-4 inline-flex text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
          >
            Review games →
          </Link>
        </article>

        <article className="group rounded-2xl border border-black/[0.07] bg-white/70 p-6 shadow-sm backdrop-blur-sm transition hover:border-amber-500/30 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900/60 dark:hover:border-amber-400/25">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-lg dark:bg-amber-400/20">
            <span aria-hidden>🧩</span>
            <span
              aria-hidden
              className="absolute -right-[4px] -top-[3px] text-[11px] leading-none"
            >
              🧠
            </span>
          </div>
          <h2 className="mt-4 text-sm font-semibold text-foreground">
            Pattern training
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/65">
            Pull public Lichess/Chess.com games and convert recurring mistakes
            into drillable puzzle sets.
          </p>
          <Link
            href="/patterns"
            className="mt-4 inline-flex text-sm font-medium text-amber-800 hover:underline dark:text-amber-300"
          >
            Drill patterns →
          </Link>
        </article>

        <article className="group rounded-2xl border border-black/[0.07] bg-white/70 p-6 shadow-sm backdrop-blur-sm transition hover:border-emerald-500/30 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900/60 dark:hover:border-emerald-400/25">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-lg dark:bg-emerald-400/20">
            📈
          </div>
          <h2 className="mt-4 text-sm font-semibold text-foreground">
            Statistics
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/65">
            Track win/draw/loss rates, opening performance by color, and
            spot openings that need more work.
          </p>
          <Link
            href="/statistics"
            className="mt-4 inline-flex text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
          >
            View statistics →
          </Link>
        </article>

      </div>
    </SitePageShell>
  );
}
