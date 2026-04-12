import { NextRequest, NextResponse } from "next/server";

import { splitConcatenatedPgns } from "@/lib/patternsParse";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.trim();
  const maxRaw = Number(req.nextUrl.searchParams.get("max") ?? "50");
  const max = Math.min(500, Math.max(10, Number.isFinite(maxRaw) ? maxRaw : 50));

  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&sort=dateDesc`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/x-chess-pgn",
      "User-Agent": "ChessCoach/1.0 (local study app; not a scraper farm)",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error: `Lichess returned ${res.status}`,
        detail: errText.slice(0, 200),
      },
      { status: res.status === 404 ? 404 : 502 },
    );
  }

  const raw = await res.text();
  const games = splitConcatenatedPgns(raw);

  return NextResponse.json({
    games,
    count: games.length,
  });
}
