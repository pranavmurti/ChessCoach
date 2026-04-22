"use client";

import { useEffect, useState } from "react";

import { SitePageShell } from "@/components/SitePageShell";
import { runStatsScan, type OpeningStat, type WdlCounts } from "@/lib/statsAnalyze";

const MIN_SPINNER_MS = 350;

async function yieldForPaint(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function PctStack({ stats }: { stats: WdlCounts }) {
  const win = stats.total ? (stats.wins / stats.total) * 100 : 0;
  const draw = stats.total ? (stats.draws / stats.total) * 100 : 0;
  const loss = stats.total ? (stats.losses / stats.total) * 100 : 0;
  const fmt = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div className="space-y-2">
      <div className="h-3 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className="flex h-full w-full">
          <div className="bg-emerald-500" style={{ width: `${win}%` }} />
          <div className="bg-zinc-400 dark:bg-zinc-500" style={{ width: `${draw}%` }} />
          <div className="bg-rose-500" style={{ width: `${loss}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-foreground/75">
        <span>W {fmt(win)} ({stats.wins})</span>
        <span>D {fmt(draw)} ({stats.draws})</span>
        <span>L {fmt(loss)} ({stats.losses})</span>
      </div>
    </div>
  );
}

function OpeningList({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: OpeningStat[];
  emptyMessage?: string;
}) {
  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white/75 p-5 shadow-sm ring-1 ring-black/[0.04] dark:border-white/[0.08] dark:bg-zinc-900/65 dark:ring-white/[0.05]">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/55">
          {emptyMessage ?? "No matching games yet."}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((o) => (
            <li key={`${o.side}-${o.opening}`} className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <div className="text-sm font-medium text-foreground">{o.opening}</div>
              <div className="mt-1 text-xs text-foreground/65">
                {o.count} games · W {o.winPct}% ({o.wins}) · D {o.drawPct}% ({o.draws}) · L {o.lossPct}% ({o.losses})
              </div>
              <div className="mt-2">
                <PctStack
                  stats={{
                    wins: o.wins,
                    draws: o.draws,
                    losses: o.losses,
                    total: o.count,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function StatisticsPage() {
  const [provider, setProvider] = useState<"lichess" | "chesscom">("lichess");
  const [username, setUsername] = useState("");
  const [fetchCount, setFetchCount] = useState(200);
  const [whiteFirstMoveFilter, setWhiteFirstMoveFilter] = useState("all");
  const [blackAgainstFilter, setBlackAgainstFilter] = useState("all");
  const [fetching, setFetching] = useState(false);
  const [computing, setComputing] = useState(false);
  const [pgns, setPgns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [baseResult, setBaseResult] = useState<ReturnType<typeof runStatsScan> | null>(null);
  const [result, setResult] = useState<ReturnType<typeof runStatsScan> | null>(null);

  useEffect(() => {
    const u = username.trim();
    if (!u || pgns.length === 0) {
      setBaseResult(null);
      setResult(null);
      setComputing(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const started = performance.now();
      setComputing(true);
      await yieldForPaint();
      if (cancelled) return;
      const base = runStatsScan({
        pgns,
        username: u,
        maxGames: pgns.length,
        whiteFirstMove: "all",
        blackAgainstMove: "all",
      });
      setBaseResult(base);
      const filtered = runStatsScan({
        pgns,
        username: u,
        maxGames: pgns.length,
        whiteFirstMove: whiteFirstMoveFilter,
        blackAgainstMove: blackAgainstFilter,
      });
      setResult(filtered);
      const elapsed = performance.now() - started;
      if (elapsed < MIN_SPINNER_MS) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, MIN_SPINNER_MS - elapsed),
        );
      }
      if (!cancelled) setComputing(false);
    };
    void run();
    return () => {
      cancelled = true;
      setComputing(false);
    };
  }, [pgns, username]);

  useEffect(() => {
    const u = username.trim();
    if (!u || pgns.length === 0 || !baseResult) return;
    let cancelled = false;
    const run = async () => {
      const started = performance.now();
      setComputing(true);
      await yieldForPaint();
      if (cancelled) return;
      const filtered = runStatsScan({
        pgns,
        username: u,
        maxGames: pgns.length,
        whiteFirstMove: whiteFirstMoveFilter,
        blackAgainstMove: blackAgainstFilter,
      });
      setResult(filtered);
      const elapsed = performance.now() - started;
      if (elapsed < MIN_SPINNER_MS) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, MIN_SPINNER_MS - elapsed),
        );
      }
      if (!cancelled) setComputing(false);
    };
    void run();
    return () => {
      cancelled = true;
      setComputing(false);
    };
  }, [
    whiteFirstMoveFilter,
    blackAgainstFilter,
    pgns,
    username,
    baseResult,
  ]);

  const fetchGames = async () => {
    setError(null);
    setPgns([]);
    setBaseResult(null);
    setResult(null);
    setWhiteFirstMoveFilter("all");
    setBlackAgainstFilter("all");
    const u = username.trim();
    if (!u) {
      setError("Enter a username.");
      return;
    }
    setFetching(true);
    try {
      const path =
        provider === "lichess"
          ? `/api/patterns/lichess?username=${encodeURIComponent(u)}&max=${fetchCount}`
          : `/api/patterns/chesscom?username=${encodeURIComponent(u)}&max=${fetchCount}`;
      const res = await fetch(path);
      const data = (await res.json()) as {
        games?: string[];
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setError(data.error ?? data.detail ?? "Request failed");
        return;
      }
      const list = data.games ?? [];
      setPgns(list);
      if (!list.length) setError("No games returned for this username.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setFetching(false);
    }
  };

  return (
    <SitePageShell>
      <div className="flex flex-col gap-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
            Performance
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            My statistics
          </h1>
        </header>

        <section className="space-y-5 rounded-2xl border border-black/[0.06] bg-white/80 p-6 shadow-sm ring-1 ring-black/[0.04] dark:border-white/[0.08] dark:bg-zinc-900/75 dark:ring-white/[0.06] md:p-8">
          <div className="flex flex-wrap gap-2">
            {(["lichess", "chesscom"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setProvider(id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  provider === id
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-black/[0.04] text-foreground/80 hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15"
                }`}
              >
                {id === "lichess" ? "Lichess" : "Chess.com"}
              </button>
            ))}
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={provider === "lichess" ? "DrNykterstein" : "hikaru"}
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none ring-sky-500/0 transition focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/20 dark:border-white/10 dark:bg-zinc-950"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
              Recent games to fetch (10–1000)
            </span>
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={fetchCount}
              onChange={(e) => setFetchCount(Number(e.target.value))}
              className="w-full accent-sky-600 dark:accent-sky-500"
            />
            <span className="text-xs text-foreground/60">{fetchCount} games</span>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void fetchGames()}
              disabled={fetching}
              className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fetching ? "Fetching…" : "Compute statistics"}
            </button>
          </div>

          {baseResult ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
                  As White · I played
                </span>
                <select
                  value={whiteFirstMoveFilter}
                  onChange={(e) => setWhiteFirstMoveFilter(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/20 dark:border-white/10 dark:bg-zinc-950"
                >
                  <option value="all">All first moves</option>
                  {baseResult.whiteFirstMoveOptions.map((opt) => (
                    <option key={opt.move} value={opt.move}>
                      1. {opt.move} ({opt.count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
                  As Black · Played against
                </span>
                <select
                  value={blackAgainstFilter}
                  onChange={(e) => setBlackAgainstFilter(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/20 dark:border-white/10 dark:bg-zinc-950"
                >
                  <option value="all">All first moves</option>
                  {baseResult.blackAgainstOptions.map((opt) => (
                    <option key={opt.move} value={opt.move}>
                      1. {opt.move} ({opt.count})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : null}

          {computing ? (
            <div className="flex items-center gap-2 text-sm text-foreground/70">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500" />
              Updating statistics…
            </div>
          ) : null}
        </section>

        {result ? (
          <>
            <section className="rounded-2xl border border-black/[0.06] bg-white/75 p-5 shadow-sm ring-1 ring-black/[0.04] dark:border-white/[0.08] dark:bg-zinc-900/65 dark:ring-white/[0.05]">
              <p className="text-sm text-foreground/70">
                Considered {result.gamesConsidered} games
                {result.gamesSkippedNoUserColor > 0
                  ? ` · skipped ${result.gamesSkippedNoUserColor} (username not found in PGN headers)`
                  : ""}
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-black/[0.03] p-4 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
                    Overall
                  </div>
                  <div className="mt-1 text-sm text-foreground/80">{result.overall.total} games</div>
                  <div className="mt-2">
                    <PctStack stats={result.overall} />
                  </div>
                </div>
                <div className="rounded-xl bg-black/[0.03] p-4 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
                    As White
                  </div>
                  <div className="mt-1 text-sm text-foreground/80">{result.asWhite.total} games</div>
                  <div className="mt-2">
                    <PctStack stats={result.asWhite} />
                  </div>
                </div>
                <div className="rounded-xl bg-black/[0.03] p-4 dark:bg-white/[0.04]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
                    As Black
                  </div>
                  <div className="mt-1 text-sm text-foreground/80">{result.asBlack.total} games</div>
                  <div className="mt-2">
                    <PctStack stats={result.asBlack} />
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <OpeningList title="Top 3 most played openings (White)" rows={result.topOpeningsWhite} />
              <OpeningList title="Top 3 most played openings (Black)" rows={result.topOpeningsBlack} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <OpeningList
                title="Other openings as White (10+ games, excluding top 3)"
                rows={result.allOpeningsWhite}
                emptyMessage="No additional White openings (outside top 3) have reached 10 games yet."
              />
              <OpeningList
                title="Other openings as Black (10+ games, excluding top 3)"
                rows={result.allOpeningsBlack}
                emptyMessage="No additional Black openings (outside top 3) have reached 10 games yet."
              />
            </div>

            <OpeningList
              title="Openings to work on (from your top 3 as White + top 3 as Black)"
              rows={result.openingsToWorkOn}
            />
          </>
        ) : null}
      </div>
    </SitePageShell>
  );
}

