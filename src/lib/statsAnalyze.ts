import { Chess } from "chess.js";

export type WdlCounts = {
  wins: number;
  draws: number;
  losses: number;
  total: number;
};

export type OpeningStat = {
  opening: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
  drawPct: number;
  lossPct: number;
  side: "white" | "black";
};

export type StatsScanResult = {
  gamesConsidered: number;
  gamesSkippedNoUserColor: number;
  overall: WdlCounts;
  asWhite: WdlCounts;
  asBlack: WdlCounts;
  topOpeningsWhite: OpeningStat[];
  topOpeningsBlack: OpeningStat[];
  allOpeningsWhite: OpeningStat[];
  allOpeningsBlack: OpeningStat[];
  openingsToWorkOn: OpeningStat[];
  whiteFirstMoveOptions: Array<{ move: string; count: number }>;
  blackAgainstOptions: Array<{ move: string; count: number }>;
};

type Outcome = "win" | "draw" | "loss";

function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers = pgn.match(/\[(\w+)\s+"([^"]*)"\]/g) ?? [];
  const headerMap: Record<string, string> = {};
  for (const h of headers) {
    const m = h.match(/\[(\w+)\s+"([^"]*)"\]/);
    if (m) headerMap[m[1]] = m[2];
  }
  return headerMap;
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

function userColorFromHeaders(
  headers: Record<string, string>,
  username: string,
): "w" | "b" | null {
  const u = normalizeUsername(username);
  if (!u) return null;
  const white = normalizeUsername(headers["White"] ?? "");
  const black = normalizeUsername(headers["Black"] ?? "");
  if (white && white === u) return "w";
  if (black && black === u) return "b";
  return null;
}

function outcomeForUser(result: string, userColor: "w" | "b"): Outcome | null {
  if (result === "1/2-1/2") return "draw";
  if (result === "1-0") return userColor === "w" ? "win" : "loss";
  if (result === "0-1") return userColor === "b" ? "win" : "loss";
  return null;
}

function openingNameFromHeaders(headers: Record<string, string>): string {
  const opening = headers["Opening"]?.trim();
  const ecoUrl = headers["ECOUrl"]?.trim();

  const ecoUrlName = (() => {
    if (!ecoUrl) return null;
    const tail = ecoUrl.split("/").pop()?.trim();
    if (!tail) return null;
    const withoutPrefix = tail.replace(/^[A-E]\d{2}_?/, "");
    const decoded = (() => {
      try {
        return decodeURIComponent(withoutPrefix);
      } catch {
        return withoutPrefix;
      }
    })();
    const cleaned = decoded
      .replaceAll("_", " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || null;
  })();

  const openingText =
    opening ||
    (ecoUrlName
      ? ecoUrlName.replace(/\bDefense\b/i, "Defense").trim()
      : null);
  if (openingText) {
    // Keep only base opening name (drop variation suffixes).
    const noColon = openingText.split(":")[0]?.trim() ?? openingText;
    const noComma = noColon.split(",")[0]?.trim() ?? noColon;
    return noComma || "Unknown opening";
  }
  return "Unknown opening";
}

function addOutcome(target: WdlCounts, outcome: Outcome): void {
  target.total += 1;
  if (outcome === "win") target.wins += 1;
  else if (outcome === "draw") target.draws += 1;
  else target.losses += 1;
}

function emptyWdl(): WdlCounts {
  return { wins: 0, draws: 0, losses: 0, total: 0 };
}

function toPct(n: number, total: number): number {
  if (!total) return 0;
  return Math.round((n / total) * 1000) / 10;
}

function mapToOpeningStats(
  map: Map<string, WdlCounts>,
  side: "white" | "black",
): OpeningStat[] {
  return [...map.entries()]
    .map(([opening, c]) => ({
      opening,
      count: c.total,
      wins: c.wins,
      draws: c.draws,
      losses: c.losses,
      winPct: toPct(c.wins, c.total),
      drawPct: toPct(c.draws, c.total),
      lossPct: toPct(c.losses, c.total),
      side,
    }))
    .sort((a, b) => b.count - a.count || b.winPct - a.winPct);
}

function firstWhiteMoveFromPgn(pgn: string): string | null {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch {
    return null;
  }
  const hist = chess.history({ verbose: true });
  const san = hist[0]?.san?.trim();
  if (!san) return null;
  return san.replace(/[+#?!]+$/g, "");
}

export function runStatsScan(args: {
  pgns: string[];
  username: string;
  maxGames?: number;
  whiteFirstMove?: string;
  blackAgainstMove?: string;
}): StatsScanResult {
  const {
    pgns,
    username,
    maxGames = pgns.length,
    whiteFirstMove = "all",
    blackAgainstMove = "all",
  } = args;
  const toScan = pgns.slice(0, maxGames);

  const overall = emptyWdl();
  const asWhite = emptyWdl();
  const asBlack = emptyWdl();
  const byOpeningWhite = new Map<string, WdlCounts>();
  const byOpeningBlack = new Map<string, WdlCounts>();
  const whiteFirstMoveCounts = new Map<string, number>();
  const blackAgainstCounts = new Map<string, number>();

  let gamesSkippedNoUserColor = 0;
  let gamesConsidered = 0;

  for (const pgn of toScan) {
    const headers = parsePgnHeaders(pgn);
    const userColor = userColorFromHeaders(headers, username);
    if (!userColor) {
      gamesSkippedNoUserColor += 1;
      continue;
    }

    const outcome = outcomeForUser(headers["Result"] ?? "", userColor);
    if (!outcome) continue;
    const firstWhiteMove = firstWhiteMoveFromPgn(pgn);
    if (userColor === "w" && firstWhiteMove) {
      whiteFirstMoveCounts.set(
        firstWhiteMove,
        (whiteFirstMoveCounts.get(firstWhiteMove) ?? 0) + 1,
      );
    }
    if (userColor === "b" && firstWhiteMove) {
      blackAgainstCounts.set(
        firstWhiteMove,
        (blackAgainstCounts.get(firstWhiteMove) ?? 0) + 1,
      );
    }

    const filteredOutWhite =
      userColor === "w" &&
      whiteFirstMove !== "all" &&
      firstWhiteMove !== whiteFirstMove;
    const filteredOutBlack =
      userColor === "b" &&
      blackAgainstMove !== "all" &&
      firstWhiteMove !== blackAgainstMove;
    if (filteredOutWhite || filteredOutBlack) continue;

    gamesConsidered += 1;
    addOutcome(overall, outcome);
    const opening = openingNameFromHeaders(headers);
    if (userColor === "w") {
      addOutcome(asWhite, outcome);
      const cur = byOpeningWhite.get(opening) ?? emptyWdl();
      addOutcome(cur, outcome);
      byOpeningWhite.set(opening, cur);
    } else {
      addOutcome(asBlack, outcome);
      const cur = byOpeningBlack.get(opening) ?? emptyWdl();
      addOutcome(cur, outcome);
      byOpeningBlack.set(opening, cur);
    }
  }

  const whiteStats = mapToOpeningStats(byOpeningWhite, "white");
  const blackStats = mapToOpeningStats(byOpeningBlack, "black");
  const topOpeningsWhite = whiteStats.slice(0, 3);
  const topOpeningsBlack = blackStats.slice(0, 3);
  const topWhiteNames = new Set(topOpeningsWhite.map((o) => o.opening));
  const topBlackNames = new Set(topOpeningsBlack.map((o) => o.opening));

  const openingsToWorkOn = [...topOpeningsWhite, ...topOpeningsBlack]
    .sort((a, b) => b.lossPct - a.lossPct || a.winPct - b.winPct || b.count - a.count)
    .slice(0, 4);

  return {
    gamesConsidered,
    gamesSkippedNoUserColor,
    overall,
    asWhite,
    asBlack,
    topOpeningsWhite,
    topOpeningsBlack,
    allOpeningsWhite: whiteStats.filter(
      (o) => o.count >= 10 && !topWhiteNames.has(o.opening),
    ),
    allOpeningsBlack: blackStats.filter(
      (o) => o.count >= 10 && !topBlackNames.has(o.opening),
    ),
    openingsToWorkOn,
    whiteFirstMoveOptions: [...whiteFirstMoveCounts.entries()]
      .map(([move, count]) => ({ move, count }))
      .sort((a, b) => b.count - a.count || a.move.localeCompare(b.move)),
    blackAgainstOptions: [...blackAgainstCounts.entries()]
      .map(([move, count]) => ({ move, count }))
      .sort((a, b) => b.count - a.count || a.move.localeCompare(b.move)),
  };
}

