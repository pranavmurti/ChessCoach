import Link from "next/link";

import { SitePageShell } from "@/components/SitePageShell";

export default function HomePage() {
  return (
    <SitePageShell paddingClass="pb-16 pt-12 md:pb-24 md:pt-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
          Engine-backed · In your browser
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
          Train smarter with a coach that respects your level
        </h1>
        <p className="mt-5 text-base leading-relaxed text-foreground/70 md:text-lg">
          Compare Stockfish truth with human-tuned guidance, review full games,
          and turn your online games into targeted puzzles — no accounts
          required for the core tools.
        </p>
        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            href="/coach"
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-8 py-3.5 text-sm font-semibold text-background shadow-lg shadow-black/10 transition hover:opacity-90 dark:shadow-black/40"
          >
            Open board &amp; analyze
          </Link>
          <Link
            href="/patterns"
            className="inline-flex items-center justify-center rounded-xl border border-black/15 bg-white/80 px-8 py-3.5 text-sm font-semibold text-foreground backdrop-blur-sm transition hover:bg-white dark:border-white/15 dark:bg-zinc-900/80 dark:hover:bg-zinc-800"
          >
            See my patterns
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-20 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        <article className="group rounded-2xl border border-black/[0.07] bg-white/70 p-6 shadow-sm backdrop-blur-sm transition hover:border-sky-500/25 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900/60 dark:hover:border-sky-400/20">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-lg dark:bg-sky-400/20">
            ♟
          </div>
          <h2 className="mt-4 text-sm font-semibold text-foreground">
            Live analyze
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/65">
            Board, eval bar, multi-PV lines, and optional live Stockfish as you
            move.
          </p>
          <Link
            href="/coach"
            className="mt-4 inline-flex text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
          >
            Go to analyze →
          </Link>
        </article>

        <article className="group rounded-2xl border border-black/[0.07] bg-white/70 p-6 shadow-sm backdrop-blur-sm transition hover:border-violet-500/25 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900/60 dark:hover:border-violet-400/20">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-lg dark:bg-violet-400/20">
            📊
          </div>
          <h2 className="mt-4 text-sm font-semibold text-foreground">
            Game review
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/65">
            Paste PGNs, step through mistakes, badges, and an eval graph over
            the whole game.
          </p>
          <Link
            href="/coach"
            className="mt-4 inline-flex text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
          >
            Open review tools →
          </Link>
        </article>

        <article className="group rounded-2xl border border-black/[0.07] bg-white/70 p-6 shadow-sm backdrop-blur-sm transition hover:border-amber-500/30 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900/60 dark:hover:border-amber-400/25">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-lg dark:bg-amber-400/20">
            🎯
          </div>
          <h2 className="mt-4 text-sm font-semibold text-foreground">
            Pattern training
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/65">
            Pull public Lichess or Chess.com games, scan for recurring mistakes,
            then drill positions on the board with hints and solutions.
          </p>
          <Link
            href="/patterns"
            className="mt-4 inline-flex text-sm font-medium text-amber-800 hover:underline dark:text-amber-300"
          >
            Train patterns →
          </Link>
        </article>
      </div>

      <p className="mx-auto mt-16 max-w-lg text-center text-xs text-foreground/45">
        Runs Stockfish in your browser via Web Worker. Fetching games uses only
        public APIs — never your password.
      </p>
    </SitePageShell>
  );
}
