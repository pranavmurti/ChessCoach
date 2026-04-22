"use client";

import { useCallback, useRef, useState } from "react";

import { SitePageShell } from "@/components/SitePageShell";
import {
  PatternTrainer,
  type TrainerQueueItem,
} from "@/components/PatternTrainer";
import { runPatternScan } from "@/lib/patternsAnalyze";
import type { MistakeCategory, PatternScanResult } from "@/lib/patternsTypes";
import { StockfishClient } from "@/lib/stockfishClient";

const CATEGORY_LABEL: Record<MistakeCategory, string> = {
  positional: "Positional mistakes",
  tactical_miss: "Tactical misses",
  piece_blunder: "Piece blunders",
};

const CATEGORY_HELP: Record<MistakeCategory, string> = {
  positional:
    "Eval dropped without a big material change — plans, pawn structure, piece placement.",
  tactical_miss:
    "Large eval swing while keeping material — missed tactics, forks, skewers, wins of material.",
  piece_blunder:
    "Hung material outright or lost a piece to a tactic after the move.",
};

const CATEGORY_ACCENT: Record<MistakeCategory, string> = {
  positional: "border-l-emerald-500 dark:border-l-emerald-400",
  tactical_miss: "border-l-amber-500 dark:border-l-amber-400",
  piece_blunder: "border-l-rose-500 dark:border-l-rose-400",
};

export default function PatternsPage() {
  const [provider, setProvider] = useState<"lichess" | "chesscom">("lichess");
  const [username, setUsername] = useState("");
  const [fetchCount, setFetchCount] = useState(50);
  const [analyzeCap, setAnalyzeCap] = useState(24);
  const [fetching, setFetching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pgns, setPgns] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<PatternScanResult | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [trainerQueue, setTrainerQueue] = useState<TrainerQueueItem[]>([]);
  const [trainerSessionKey, setTrainerSessionKey] = useState(0);
  const engineRef = useRef<StockfishClient | null>(null);

  const endTrainerSession = useCallback(() => {
    setTrainerQueue([]);
  }, []);

  const startTrainerFromMistakes = useCallback(
    (cat: MistakeCategory, startIndex: number, data: PatternScanResult) => {
      const list = data.topMistakes[cat].slice(startIndex);
      if (!list.length) return;
      setTrainerSessionKey((k) => k + 1);
      setTrainerQueue(
        list.map((m) => ({
          startFen: m.exampleFen,
          pvUci: m.pvUci?.trim() ? m.pvUci : m.bestUci,
          label: `${CATEGORY_LABEL[cat]} · ${m.label}`,
        })),
      );
    },
    [],
  );

  const startTrainerFromPuzzles = useCallback(
    (startIndex: number, data: PatternScanResult) => {
      const list = data.puzzles.slice(startIndex);
      if (!list.length) return;
      setTrainerSessionKey((k) => k + 1);
      setTrainerQueue(
        list.map((p) => ({
          startFen: p.fen,
          pvUci: p.pvUci?.trim() ? p.pvUci : p.solutionUci,
          label: p.prompt,
        })),
      );
    },
    [],
  );

  const ensureEngine = useCallback(async () => {
    if (!engineRef.current) {
      const c = new StockfishClient();
      await c.init();
      engineRef.current = c;
    }
    return engineRef.current;
  }, []);

  const fetchGames = async () => {
    setFetchError(null);
    setPgns([]);
    setResult(null);
    const u = username.trim();
    if (!u) {
      setFetchError("Enter a username.");
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
        setFetchError(data.error ?? data.detail ?? "Request failed");
        return;
      }
      const list = data.games ?? [];
      setPgns(list);
      if (list.length) setFetchError(null);
      else
        setFetchError(
          "No games returned (private account or wrong username?).",
        );
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Network error");
    } finally {
      setFetching(false);
    }
  };

  const runScan = async () => {
    if (!pgns.length) return;
    const uname = username.trim();
    if (!uname) {
      setFetchError(
        "Enter your username before scanning so we only count mistakes on your moves.",
      );
      return;
    }
    setFetchError(null);
    setScanning(true);
    setResult(null);
    setProgress("Starting engine…");
    try {
      const client = await ensureEngine();
      const maxGames = Math.min(pgns.length, analyzeCap);
      setProgress(`Analyzing ${maxGames} games (depth 8)…`);
      const out = await runPatternScan({
        client,
        pgns,
        username: uname,
        maxGames,
        depth: 8,
        onProgress: (d, t) => {
          setProgress(`Games ${d}/${t}…`);
        },
      });
      setResult(out);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  return (
    <SitePageShell>
      <div className="flex flex-col gap-10">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
            Pattern lab
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            See my patterns
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/70 md:text-base">
            Enter a public{" "}
            <span className="font-medium text-foreground">Lichess</span> or{" "}
            <span className="font-medium text-foreground">Chess.com</span>{" "}
            username.
          </p>
        </header>

        <section className="relative space-y-5 rounded-2xl border border-black/[0.06] bg-white/80 p-6 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-sm dark:border-white/[0.08] dark:bg-zinc-900/75 dark:ring-white/[0.06] md:p-8">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-foreground/45">
            Source
          </span>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {(
              [
                { id: "lichess" as const, label: "Lichess" },
                { id: "chesscom" as const, label: "Chess.com" },
              ] as const
            ).map(({ id, label }) => (
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
                {label}
              </button>
            ))}
          </div>
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

        <label className="block space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground/55">
            Max games to engine-scan (large values = long run in this tab)
          </span>
          <input
            type="range"
            min={5}
            max={Math.max(fetchCount, 5)}
            step={1}
            value={Math.min(analyzeCap, Math.max(fetchCount, 5))}
            onChange={(e) => setAnalyzeCap(Number(e.target.value))}
            className="w-full accent-violet-600 dark:accent-violet-500"
          />
          <span className="text-xs text-foreground/60">
            Up to {Math.min(analyzeCap, fetchCount)} of your {fetchCount}{" "}
            fetched games per scan.
          </span>
        </label>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={() => void fetchGames()}
            disabled={fetching}
            className="rounded-xl border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            {fetching ? "Fetching…" : "Fetch games"}
          </button>
          <button
            type="button"
            onClick={() => void runScan()}
            disabled={scanning || pgns.length === 0 || !username.trim()}
            className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {scanning ? "Scanning…" : "Run pattern scan"}
          </button>
        </div>

        {fetchError ? (
          <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {fetchError}
          </p>
        ) : null}
        {pgns.length > 0 ? (
          <p className="text-xs font-medium text-foreground/60">
            Loaded {pgns.length} game{pgns.length === 1 ? "" : "s"}.
          </p>
        ) : null}
        {progress ? (
          <p className="flex items-center gap-2 text-sm text-foreground/70">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500" />
            {progress}
          </p>
        ) : null}
      </section>

      {result ? (
        <>
          <div className="flex flex-col gap-2 rounded-2xl border border-black/[0.06] bg-gradient-to-br from-white/90 to-zinc-50/80 p-5 dark:border-white/[0.08] dark:from-zinc-900/80 dark:to-zinc-950/80 md:flex-row md:items-center md:justify-between">
            <div>
              {result.note ? (
                <p className="text-sm text-foreground/70">{result.note}</p>
              ) : null}
              <p className="text-sm font-medium text-foreground">
                Scanned {result.gamesScanned} game
                {result.gamesScanned === 1 ? "" : "s"}
                {result.gamesSkippedNoUserColor > 0 ? (
                  <span className="font-normal text-foreground/60">
                    {" "}
                    · skipped {result.gamesSkippedNoUserColor} with no username
                    match in headers
                  </span>
                ) : null}
                {" · "}
                <span className="text-foreground/70">
                  {result.pliesAnalyzed} positions
                </span>{" "}
                <span className="text-foreground/55">(depth 8)</span>
              </p>
            </div>
          </div>

          {trainerQueue.length > 0 ? (
            <PatternTrainer
              key={trainerSessionKey}
              queue={trainerQueue}
              onSessionComplete={endTrainerSession}
            />
          ) : null}

          <p className="max-w-3xl text-sm leading-relaxed text-foreground/60">
            Click a row to train on the board. Your color stays at the bottom;
            after each correct move the opponent reply is played from the engine
            line until it ends. Use{" "}
            <span className="font-medium text-foreground/80">Hint</span> or{" "}
            <span className="font-medium text-foreground/80">Solution</span>.
            Green ✓ / red ✕ on the destination; wrong moves are taken back.
          </p>

          {(Object.keys(CATEGORY_LABEL) as MistakeCategory[]).map((cat) => (
            <section
              key={cat}
              className={`overflow-hidden rounded-2xl border border-black/[0.06] bg-white/75 shadow-sm ring-1 ring-black/[0.04] dark:border-white/[0.08] dark:bg-zinc-900/70 dark:ring-white/[0.05] ${CATEGORY_ACCENT[cat]} border-l-4`}
            >
              <div className="border-b border-black/[0.05] bg-black/[0.02] px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <h2 className="text-base font-semibold text-foreground">
                  {CATEGORY_LABEL[cat]}
                </h2>
                <p className="mt-1 text-sm text-foreground/65">
                  {CATEGORY_HELP[cat]}
                </p>
              </div>
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {result.topMistakes[cat].length === 0 ? (
                  <li className="px-5 py-6 text-sm text-foreground/50">
                    No clear pattern in this bucket for this sample.
                  </li>
                ) : (
                  result.topMistakes[cat].map((m, i) => (
                    <li key={`${m.bestUci}-${m.playedUci}-${i}`}>
                      <button
                        type="button"
                        onClick={() => startTrainerFromMistakes(cat, i, result)}
                        className="w-full px-5 py-4 text-left transition hover:bg-sky-500/[0.06] dark:hover:bg-sky-400/[0.08]"
                      >
                        <div className="font-medium text-foreground">
                          {m.label}{" "}
                          <span className="font-normal text-foreground/55">
                            ×{m.count} · avg Δ ~{(m.avgLossCp / 100).toFixed(1)}
                          </span>
                        </div>
                        <div className="mt-1.5 font-mono text-xs text-foreground/70">
                          Played {m.playedUci} · Engine prefers {m.bestUci}
                        </div>
                        <div className="mt-2 text-xs font-semibold text-sky-700 dark:text-sky-400">
                          ▶ Train on board (this + rest of category)
                        </div>
                      </button>
                      {m.sourceGameUrl ? (
                        <div className="border-t border-black/[0.04] px-5 py-2 dark:border-white/[0.05]">
                          <a
                            href={m.sourceGameUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
                          >
                            Source game →
                          </a>
                        </div>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            </section>
          ))}

          <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white/75 shadow-sm ring-1 ring-black/[0.04] dark:border-white/[0.08] dark:bg-zinc-900/70 dark:ring-white/[0.05]">
            <div className="border-b border-black/[0.05] bg-violet-500/[0.07] px-5 py-4 dark:bg-violet-500/10">
              <h2 className="text-base font-semibold text-foreground">
                Curated puzzle positions
              </h2>
              <p className="mt-1 text-sm text-foreground/70">
                Related positions (earlier in the game or along a best line), re‑analyzed
                by the engine — same theme as your mistake rows, not the identical FEN.
              </p>
            </div>
            <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {result.puzzles.map((p, i) => (
                <li key={i}>
                  <div className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => startTrainerFromPuzzles(i, result)}
                      className="w-full rounded-xl text-left transition hover:opacity-90"
                    >
                      <div className="text-sm text-foreground/90">
                        {p.prompt}
                      </div>
                      <div className="mt-2 break-all font-mono text-[11px] leading-relaxed text-foreground/50">
                        {p.fen}
                      </div>
                      <div className="mt-3 text-xs font-semibold text-violet-700 dark:text-violet-300">
                        ▶ Train on board (this + following puzzles)
                      </div>
                    </button>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className="text-xs font-semibold text-foreground/70 underline-offset-2 hover:underline"
                        onClick={() =>
                          setRevealed((r) => ({ ...r, [i]: !r[i] }))
                        }
                      >
                        {revealed[i] ? "Hide solution" : "Show solution (UCI)"}
                      </button>
                      {p.sourceGameUrl ? (
                        <a
                          href={p.sourceGameUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
                        >
                          Source game →
                        </a>
                      ) : null}
                    </div>
                    {revealed[i] ? (
                      <div className="mt-2 rounded-xl bg-black/[0.04] px-3 py-2 font-mono text-sm text-foreground dark:bg-white/[0.06]">
                        {p.solutionUci}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
      </div>
    </SitePageShell>
  );
}
