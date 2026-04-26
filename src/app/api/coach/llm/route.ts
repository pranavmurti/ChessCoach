import { NextResponse } from "next/server";

type CoachRequest = {
  question?: string;
  fen?: string;
  sideToMove?: "white" | "black";
  opening?: string | null;
  whiteRating?: number;
  blackRating?: number;
  bestMove?: { san?: string | null; uci?: string | null; idea?: string | null };
  topCandidates?: Array<{ rank: number; uci: string; san: string; eval: string }>;
  askedMoveProbe?: {
    san: string;
    lossCp: number | null;
    quality: string;
    refuteSan: string | null;
    refuteLine: string;
    signFlip: boolean;
    afterEvalLabel: string;
  } | null;
  actionChecklist?: string[];
};

export async function POST(req: Request) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  }

  let body: CoachRequest;
  try {
    body = (await req.json()) as CoachRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim();
  const fen = body.fen?.trim();
  if (!question || !fen) {
    return NextResponse.json({ error: "Missing question or fen" }, { status: 400 });
  }

  const openRouterModel = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b";
  const systemPrompt =
    "You are Thuggy, a chess coach. Use only the provided position/eval context. " +
    "Do not invent lines not supported by context. Keep answers practical and concise. " +
    "If the user asks about a move quality, anchor it to eval swing and refutation. " +
    "Return plain text with short paragraphs and optional bullets.";

  const userPayload = {
    question,
    fen,
    sideToMove: body.sideToMove ?? "white",
    opening: body.opening ?? null,
    ratings: {
      white: body.whiteRating ?? null,
      black: body.blackRating ?? null,
    },
    bestMove: body.bestMove ?? null,
    topCandidates: body.topCandidates ?? [],
    askedMoveProbe: body.askedMoveProbe ?? null,
    actionChecklist: body.actionChecklist ?? [],
  };

  const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterKey}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Chess Coach",
    },
    body: JSON.stringify({
      model: openRouterModel,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Answer this chess question using the structured context.\n\n" +
            JSON.stringify(userPayload, null, 2),
        },
      ],
    }),
    cache: "no-store",
  });

  if (!openRouterRes.ok) {
    const detail = await openRouterRes.text().catch(() => "");
    return NextResponse.json(
      { error: "LLM request failed", detail: detail.slice(0, 500) },
      { status: 502 },
    );
  }

  const data = (await openRouterRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    return NextResponse.json({ error: "Empty LLM response" }, { status: 502 });
  }

  return NextResponse.json({ answer });
}
