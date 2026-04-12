import { Chess, DEFAULT_POSITION } from "chess.js";

import {
  type GameMove,
  reconstructFenForPly,
  materialSumForMover,
} from "@/lib/chessCoachDomain";
import { engineScoreToWhitePerspective } from "@/lib/chessNotation";
import type { StockfishClient } from "@/lib/stockfishClient";
import type {
  MistakeCategory,
  PatternMistake,
  PatternPuzzle,
  PatternScanResult,
} from "@/lib/patternsTypes";

const DEFAULT_DEPTH = 8;
const DEFAULT_MULTIPV = 3;
const TOP_N = 10;
const PUZZLES_PER_CATEGORY = 5;

function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers = pgn.match(/\[(\w+)\s+"([^"]*)"\]/g) ?? [];
  const headerMap: Record<string, string> = {};
  for (const h of headers) {
    const m = h.match(/\[(\w+)\s+"([^"]*)"\]/);
    if (m) headerMap[m[1]] = m[2];
  }
  return headerMap;
}

function initialFenFromPgn(pgn: string): string {
  const headerMap = parsePgnHeaders(pgn);
  const setUp =
    headerMap["SetUp"] === "1" ||
    headerMap["SetUp"]?.toLowerCase() === "true";
  return setUp && headerMap["FEN"] ? headerMap["FEN"] : DEFAULT_POSITION;
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

function inferUserColorFromPgn(
  pgn: string,
  username: string,
): "w" | "b" | null {
  const u = normalizeUsername(username);
  if (!u) return null;
  const headerMap = parsePgnHeaders(pgn);
  const white = normalizeUsername(headerMap["White"] ?? "");
  const black = normalizeUsername(headerMap["Black"] ?? "");
  if (white && white === u) return "w";
  if (black && black === u) return "b";
  return null;
}

function extractSourceGameUrl(pgn: string): string | undefined {
  // Prefer explicit headers.
  const linkMatch = pgn.match(/^\[Link\s+"([^"]+)"\]/m);
  if (linkMatch?.[1]) return linkMatch[1];

  const siteMatch = pgn.match(/^\[Site\s+"([^"]+)"\]/m);
  if (siteMatch?.[1]) return siteMatch[1];

  // Heuristics for when the header contains a bare ID or a partial URL.
  const lichessUrl = pgn.match(/https?:\/\/[^"\s]*lichess\.org\/([A-Za-z0-9]+)/);
  if (lichessUrl?.[0]) return lichessUrl[0];
  const lichessId = pgn.match(/lichess\.org\/([A-Za-z0-9]{6,})/);
  if (lichessId?.[1]) return `https://lichess.org/${lichessId[1]}`;

  const chessComUrl = pgn.match(
    /https?:\/\/[^"\s]*(?:www\.)?chess\.com\/game\/[^\s"]+/,
  );
  if (chessComUrl?.[0]) return chessComUrl[0];

  return undefined;
}

function classifyMistake(
  materialLoss: number,
  lossCp: number,
): MistakeCategory | null {
  if (lossCp < 65) return null;
  const piece =
    materialLoss >= 200 ||
    (materialLoss >= 120 && lossCp >= 200) ||
    (materialLoss >= 80 && lossCp >= 280);
  if (piece) return "piece_blunder";
  const tactical = materialLoss < 180 && lossCp >= 160;
  if (tactical) return "tactical_miss";
  const positional = materialLoss < 110 && lossCp >= 70 && lossCp < 200;
  if (positional) return "positional";
  if (lossCp >= 200) return "tactical_miss";
  return "positional";
}

function histToGameMoves(chess: Chess): GameMove[] {
  const hist = chess.history({ verbose: true });
  return hist.map((mv) => ({
    uci: `${mv.from}${mv.to}${mv.promotion ?? ""}`,
    san: mv.san,
    color: mv.color as "w" | "b",
  }));
}

type RawHit = {
  category: MistakeCategory;
  lossCp: number;
  fen: string;
  bestUci: string;
  pvUci: string;
  playedUci: string;
  label: string;
  sourceGameUrl?: string;
  ply: number;
  initialFen: string;
  gameMoves: GameMove[];
  userColor: "w" | "b";
};

function mergeHits(hits: RawHit[]): PatternMistake[] {
  const map = new Map<
    string,
    {
      category: MistakeCategory;
      lossCpSum: number;
      n: number;
      example: RawHit;
    }
  >();
  for (const h of hits) {
    const key = `${h.category}|${h.bestUci}|${h.playedUci}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        category: h.category,
        lossCpSum: h.lossCp,
        n: 1,
        example: h,
      });
    } else {
      cur.lossCpSum += h.lossCp;
      cur.n += 1;
      if (h.lossCp > cur.example.lossCp) cur.example = h;
    }
  }
  return [...map.values()]
    .map((v) => ({
      category: v.category,
      label: v.example.label,
      count: v.n,
      avgLossCp: Math.round(v.lossCpSum / v.n),
      exampleFen: v.example.fen,
      bestUci: v.example.bestUci,
      pvUci: v.example.pvUci,
      playedUci: v.example.playedUci,
      sourceGameUrl: v.example.sourceGameUrl,
      userColor: v.example.userColor,
      examplePly: v.example.ply,
      initialFen: v.example.initialFen,
      gameMoves: v.example.gameMoves,
    }))
    .sort((a, b) => b.count * b.avgLossCp - a.count * a.avgLossCp);
}

function fenAfterPvPrefix(
  startFen: string,
  pvUci: string,
  plies: number,
): string | null {
  const tokens = pvUci.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || plies <= 0) return null;
  const chess = new Chess(startFen);
  for (let i = 0; i < Math.min(plies, tokens.length); i++) {
    const uci = tokens[i]!;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length >= 5 ? uci[4] : undefined;
    const ok = chess.move({
      from: from as never,
      to: to as never,
      promotion:
        promo === "q" || promo === "r" || promo === "b" || promo === "n"
          ? promo
          : undefined,
    });
    if (!ok) return null;
  }
  return chess.fen();
}

function collectPuzzleRootCandidates(m: PatternMistake): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (fen: string) => {
    if (seen.has(fen)) return;
    seen.add(fen);
    out.push(fen);
  };

  const { exampleFen, examplePly, initialFen, gameMoves, userColor, pvUci } = m;

  for (const back of [2, 4, 6]) {
    if (examplePly < back) continue;
    const ply = examplePly - back;
    let fen: string;
    try {
      fen = reconstructFenForPly(initialFen, gameMoves, ply);
    } catch {
      continue;
    }
    if (fen === exampleFen) continue;
    try {
      if (new Chess(fen).turn() === userColor) push(fen);
    } catch {
      continue;
    }
  }

  const forward2 = fenAfterPvPrefix(exampleFen, pvUci, 2);
  if (forward2 && forward2 !== exampleFen) {
    try {
      if (new Chess(forward2).turn() === userColor) push(forward2);
    } catch {
      /* ignore */
    }
  }

  const forward4 = fenAfterPvPrefix(exampleFen, pvUci, 4);
  if (forward4 && forward4 !== exampleFen) {
    try {
      if (new Chess(forward4).turn() === userColor) push(forward4);
    } catch {
      /* ignore */
    }
  }

  return out;
}

async function buildPuzzleFromMistake(
  m: PatternMistake,
  client: StockfishClient,
  depth: number,
): Promise<PatternPuzzle | null> {
  const roots = collectPuzzleRootCandidates(m);
  const catLabel = m.category.replace(/_/g, " ");

  for (const fen of roots) {
    let full;
    try {
      full = await client.analyzePosition(fen, {
        depth,
        multipv: DEFAULT_MULTIPV,
      });
    } catch {
      continue;
    }
    const lines = full.lines
      .slice()
      .sort((a, b) => (a.multipv ?? 99) - (b.multipv ?? 99));
    const bestLine = lines[0];
    if (!bestLine?.pvUci?.trim()) continue;
    const bestUci = bestLine.pvUci.split(/\s+/)[0] ?? "";
    if (!bestUci) continue;

    return {
      category: m.category,
      fen,
      solutionUci: bestUci,
      pvUci: bestLine.pvUci,
      sourceGameUrl: m.sourceGameUrl,
      prompt: `Related ${catLabel}: same kind of idea as a mistake from your games — find the best move here (not the exact game position).`,
    };
  }

  return null;
}

/**
 * Scan recently fetched games for recurring mistakes (client-side, engine-heavy).
 * Only positions where it is the given username's turn are analyzed.
 */
export async function runPatternScan(args: {
  client: StockfishClient;
  pgns: string[];
  username: string;
  maxGames?: number;
  depth?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<PatternScanResult> {
  const {
    client,
    pgns,
    username,
    maxGames = pgns.length,
    depth = DEFAULT_DEPTH,
    onProgress,
  } = args;

  await client.init();

  const u = normalizeUsername(username);
  if (!u) {
    return {
      gamesScanned: 0,
      gamesSkippedNoUserColor: 0,
      pliesAnalyzed: 0,
      topMistakes: {
        positional: [],
        tactical_miss: [],
        piece_blunder: [],
      },
      puzzles: [],
      note: "Enter your username (same as when fetching) so we only count mistakes on your moves.",
    };
  }

  const toScan = pgns.slice(0, maxGames);
  const allHits: RawHit[] = [];
  let pliesAnalyzed = 0;
  let gamesSkippedNoUserColor = 0;
  let gamesScanned = 0;

  for (let gi = 0; gi < toScan.length; gi++) {
    const pgn = toScan[gi];
    const sourceGameUrl = extractSourceGameUrl(pgn);
    const userColor = inferUserColorFromPgn(pgn, username);
    if (!userColor) {
      gamesSkippedNoUserColor++;
      onProgress?.(gi + 1, toScan.length);
      continue;
    }

    const chess = new Chess();
    try {
      chess.loadPgn(pgn, { strict: false });
    } catch {
      onProgress?.(gi + 1, toScan.length);
      continue;
    }
    const moves = histToGameMoves(chess);
    if (moves.length < 4) {
      onProgress?.(gi + 1, toScan.length);
      continue;
    }
    const initialFen = initialFenFromPgn(pgn);
    const gameLabel = `Game ${gi + 1}`;
    gamesScanned++;

    for (let ply = 0; ply < moves.length; ply++) {
      if (moves[ply].color !== userColor) continue;

      const beforeFen = reconstructFenForPly(initialFen, moves, ply);
      const mover = moves[ply].color;
      const playedUci = moves[ply].uci;
      const materialBefore = materialSumForMover(beforeFen, mover);

      const full = await client.analyzePosition(beforeFen, {
        depth,
        multipv: DEFAULT_MULTIPV,
      });
      const lines = full.lines
        .slice()
        .sort((a, b) => (a.multipv ?? 99) - (b.multipv ?? 99));
      const bestLine = lines[0];
      if (!bestLine?.pvUci) continue;

      const bestUci = bestLine.pvUci.split(/\s+/)[0] ?? "";
      const chosen =
        lines.find((l) => (l.pvUci.split(/\s+/)[0] ?? "") === playedUci) ??
        bestLine;

      const stm = new Chess(beforeFen).turn();
      const bestW = engineScoreToWhitePerspective(
        stm,
        bestLine.cp,
        bestLine.mate,
      ).cpWhite;
      const chosenW = engineScoreToWhitePerspective(
        stm,
        chosen.cp,
        chosen.mate,
      ).cpWhite;

      const lossCp =
        bestW != null && chosenW != null
          ? Math.max(0, Math.round(Math.abs(bestW - chosenW)))
          : 0;

      const probe = new Chess(beforeFen);
      const ok = probe.move({
        from: playedUci.slice(0, 2) as never,
        to: playedUci.slice(2, 4) as never,
        promotion:
          playedUci.length >= 5 &&
          ["q", "r", "b", "n"].includes(playedUci[4].toLowerCase())
            ? (playedUci[4].toLowerCase() as "q" | "r" | "b" | "n")
            : undefined,
      });
      if (!ok) continue;
      const materialAfter = materialSumForMover(probe.fen(), mover);
      const materialLoss = materialBefore - materialAfter;

      pliesAnalyzed++;
      const cat = classifyMistake(materialLoss, lossCp);
      if (!cat) continue;

      const moveNo = Math.floor(ply / 2) + 1;
      const side = mover === "w" ? "White" : "Black";
      const label = `${gameLabel} · move ${moveNo} · ${side} · ${moves[ply].san}`;

      allHits.push({
        category: cat,
        lossCp,
        fen: beforeFen,
        bestUci,
        pvUci: bestLine.pvUci,
        playedUci,
        label,
        sourceGameUrl,
        ply,
        initialFen,
        gameMoves: moves,
        userColor,
      });
    }
    onProgress?.(gi + 1, toScan.length);
  }

  const byCat = {
    positional: mergeHits(allHits.filter((h) => h.category === "positional")),
    tactical_miss: mergeHits(
      allHits.filter((h) => h.category === "tactical_miss"),
    ),
    piece_blunder: mergeHits(
      allHits.filter((h) => h.category === "piece_blunder"),
    ),
  };

  const topMistakes: PatternScanResult["topMistakes"] = {
    positional: byCat.positional.slice(0, TOP_N),
    tactical_miss: byCat.tactical_miss.slice(0, TOP_N),
    piece_blunder: byCat.piece_blunder.slice(0, TOP_N),
  };

  const puzzles: PatternPuzzle[] = [];
  for (const cat of [
    "piece_blunder",
    "tactical_miss",
    "positional",
  ] as const) {
    const list = topMistakes[cat];
    let added = 0;
    for (const m of list) {
      if (added >= PUZZLES_PER_CATEGORY) break;
      const p = await buildPuzzleFromMistake(m, client, depth);
      if (p) {
        puzzles.push(p);
        added++;
      }
    }
  }

  const parts: string[] = [];
  if (pgns.length > maxGames) {
    parts.push(
      `You fetched ${pgns.length} games; this scan analyzed the first ${maxGames} (your “max games to engine-scan” setting).`,
    );
  }
  if (gamesSkippedNoUserColor > 0) {
    parts.push(
      `${gamesSkippedNoUserColor} game${gamesSkippedNoUserColor === 1 ? "" : "s"} skipped (could not match [White]/[Black] to your username).`,
    );
  }
  const note = parts.length > 0 ? parts.join(" ") : undefined;

  return {
    gamesScanned,
    gamesSkippedNoUserColor,
    pliesAnalyzed,
    topMistakes,
    puzzles,
    note,
  };
}
