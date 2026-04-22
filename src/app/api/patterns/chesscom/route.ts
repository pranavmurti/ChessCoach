import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.trim();
  const maxRaw = Number(req.nextUrl.searchParams.get("max") ?? "50");
  const max = Math.min(1000, Math.max(10, Number.isFinite(maxRaw) ? maxRaw : 50));

  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`;
  const ar = await fetch(archivesUrl, { cache: "no-store" });

  if (!ar.ok) {
    return NextResponse.json(
      { error: `Chess.com archives: ${ar.status}` },
      { status: ar.status === 404 ? 404 : 502 },
    );
  }

  const arData = (await ar.json()) as { archives?: string[] };
  const archives = [...(arData.archives ?? [])].reverse();

  const games: string[] = [];

  for (const monthUrl of archives) {
    if (games.length >= max) break;
    const gr = await fetch(monthUrl, { cache: "no-store" });
    if (!gr.ok) continue;
    const gd = (await gr.json()) as {
      games?: { pgn?: string }[];
    };
    for (const g of gd.games ?? []) {
      if (games.length >= max) break;
      if (g.pgn?.trim()) games.push(g.pgn.trim());
    }
  }

  return NextResponse.json({ games, count: games.length });
}
