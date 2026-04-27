"use client";

import { Chess, DEFAULT_POSITION } from "chess.js";
import { useEffect, useRef, useState } from "react";

import { ChessBoard, type ChessBoardHandle, type ChessBoardProps } from "@/components/ChessBoard";
import type { GameMove } from "@/lib/chessCoachDomain";
import { reconstructFenForPly } from "@/lib/chessCoachDomain";
import { runFullGameReview } from "@/lib/chessCoachReview";
import { SitePageShell } from "@/components/SitePageShell";
import type { EngineLine, StockfishClient } from "@/lib/stockfishClient";
import { StockfishClient as StockfishClientClass } from "@/lib/stockfishClient";
import { runStatsScan, type StatsScanResult } from "@/lib/statsAnalyze";
import {
  engineScoreToWhitePerspective,
  formatWhiteEval,
  uciSequenceToSan,
  uciToSan,
} from "@/lib/chessNotation";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type OnboardingStage =
  | "welcome"
  | "skill"
  | "goal"
  | "hours"
  | "provider"
  | "username"
  | "maxGames"
  | "ready";

type CoachProfile = {
  skillLevel: string;
  goal: string;
  weeklyHours: string;
  provider: "chesscom" | "lichess";
  username: string;
  maxGames: number;
};

type VisibleEngineLine = {
  rank: number;
  uci: string;
  san: string;
  evalLabel: string;
  lineSans: string;
};

function AssistantFlowText({
  text,
  animate,
}: {
  text: string;
  animate: boolean;
}) {
  const [shown, setShown] = useState(animate ? "" : text);

  useEffect(() => {
    if (!animate) {
      setShown(text);
      return;
    }
    const tokens = text.split(/(\s+)/);
    let i = 0;
    setShown("");
    const timer = window.setInterval(() => {
      i = Math.min(tokens.length, i + 1);
      setShown(tokens.slice(0, i).join(""));
      if (i >= tokens.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [text, animate]);

  return <span className="block">{shown}</span>;
}

type PersistedState = {
  profile: CoachProfile;
  stage: OnboardingStage;
  positionFen: string;
  patternsNotes: string;
  statsNotes: string;
  accountSummary: string | null;
  messages: ChatMessage[];
};

const DEEP_DIVE_STATE_KEY = "thuggy-deep-dive-state-v1";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanCoachText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isSkipToken(input: string): boolean {
  const v = input.trim().toLowerCase();
  return (
    v === "skip" ||
    v === "skip onboarding" ||
    v === "skip for now" ||
    v === "later"
  );
}

function isNoneToken(input: string): boolean {
  const v = input.trim().toLowerCase();
  return v === "none" || v === "no account" || v === "dont have one" || v === "don't have one";
}

function requestedProvider(input: string): "chesscom" | "lichess" | null {
  const lower = input.toLowerCase();
  if (lower.includes("lichess")) return "lichess";
  if (
    lower.includes("chess.com") ||
    lower.includes("chess com") ||
    lower.includes("chesscom")
  ) {
    return "chesscom";
  }
  return null;
}

function isAccountIntent(input: string): boolean {
  const lower = input.toLowerCase();
  return (
    lower.includes("account") ||
    lower.includes("username") ||
    lower.includes("games") ||
    lower.includes("stats") ||
    lower.includes("statistics") ||
    lower.includes("analyze") ||
    lower.includes("analyse") ||
    lower.includes("scan") ||
    lower.includes("switch") ||
    lower.includes("change")
  );
}

function summarizeStats(result: StatsScanResult): string {
  const topW = result.topOpeningsWhite[0];
  const topB = result.topOpeningsBlack[0];
  const weak = result.openingsToWorkOn[0];
  return [
    `Games analyzed: ${result.gamesConsidered}`,
    `Overall: ${result.overall.wins}W ${result.overall.draws}D ${result.overall.losses}L`,
    topW ? `Most played as White: ${topW.opening} (${topW.count} games)` : "",
    topB ? `Most played as Black: ${topB.opening} (${topB.count} games)` : "",
    weak ? `Main opening to improve: ${weak.opening} (${weak.lossPct}% loss)` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function DeepDivePage() {
  const boardRef = useRef<ChessBoardHandle>(null);
  const engineRef = useRef<StockfishClient | null>(null);
  const engineReadyRef = useRef(false);
  const reviewEngineRef = useRef<StockfishClient | null>(null);
  const reviewEngineReadyRef = useRef(false);
  const gameReviewSeqRef = useRef(0);
  const visibleEngineSeqRef = useRef(0);

  const [profile, setProfile] = useState<CoachProfile>({
    skillLevel: "",
    goal: "",
    weeklyHours: "",
    provider: "chesscom",
    username: "",
    maxGames: 300,
  });
  const [stage, setStage] = useState<OnboardingStage>("welcome");
  const [positionFen, setPositionFen] = useState(DEFAULT_POSITION);
  const [patternsNotes, setPatternsNotes] = useState("");
  const [statsNotes, setStatsNotes] = useState("");
  const [accountSummary, setAccountSummary] = useState<string | null>(null);
  const [statsResult, setStatsResult] = useState<StatsScanResult | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [memoryReady, setMemoryReady] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      text:
        "Welcome to Deep Dive with ThuggyBot.\n\n" +
        "First question: what's your current skill level (beginner, intermediate, advanced, or rating range)?",
    },
  ]);
  const [suggestions, setSuggestions] = useState<string[]>([
    "Beginner",
    "Intermediate",
    "Advanced",
    "Around 1500 rapid",
    "Skip onboarding",
  ]);
  const [gamePgn, setGamePgn] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewInitialFen, setReviewInitialFen] = useState(DEFAULT_POSITION);
  const [reviewMoves, setReviewMoves] = useState<GameMove[]>([]);
  const [reviewAnalysis, setReviewAnalysis] = useState<Awaited<
    ReturnType<typeof runFullGameReview>
  > | null>(null);
  const [reviewPly, setReviewPly] = useState(0);
  const [reviewUserLineMode, setReviewUserLineMode] = useState(false);
  const [reviewBoardOrientation, setReviewBoardOrientation] = useState<"white" | "black">("white");
  const [flowMessageId, setFlowMessageId] = useState<string | null>(null);
  const [visibleEngineFen, setVisibleEngineFen] = useState(DEFAULT_POSITION);
  const [visibleEngineLines, setVisibleEngineLines] = useState<VisibleEngineLine[]>([]);
  const [visibleEngineLoading, setVisibleEngineLoading] = useState(false);
  const [visibleEngineEval, setVisibleEngineEval] = useState("—");

  const pushAssistant = (text: string, nextSuggestions?: string[]) => {
    const id = uid();
    setFlowMessageId(id);
    setMessages((prev) => [...prev, { id, role: "assistant", text }]);
    if (nextSuggestions) setSuggestions(nextSuggestions);
  };

  const resetDeepDiveMemory = () => {
    try {
      localStorage.removeItem(DEEP_DIVE_STATE_KEY);
    } catch {
      // ignore
    }
    setProfile({
      skillLevel: "",
      goal: "",
      weeklyHours: "",
      provider: "chesscom",
      username: "",
      maxGames: 300,
    });
    setStage("welcome");
    setPositionFen(DEFAULT_POSITION);
    setPatternsNotes("");
    setStatsNotes("");
    setAccountSummary(null);
    setStatsResult(null);
    setMessages([
      {
        id: uid(),
        role: "assistant",
        text:
          "Welcome to Deep Dive with ThuggyBot.\n\n" +
          "First question: what's your current skill level (beginner, intermediate, advanced, or rating range)?",
      },
    ]);
    setSuggestions(["Beginner", "Intermediate", "Advanced", "Around 1500 rapid"]);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DEEP_DIVE_STATE_KEY);
      if (!raw) {
        setMemoryReady(true);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (parsed.profile) setProfile(parsed.profile);
      if (parsed.stage) setStage(parsed.stage);
      if (parsed.positionFen) setPositionFen(parsed.positionFen);
      if (typeof parsed.patternsNotes === "string") setPatternsNotes(parsed.patternsNotes);
      if (typeof parsed.statsNotes === "string") setStatsNotes(parsed.statsNotes);
      if (typeof parsed.accountSummary === "string" || parsed.accountSummary === null) {
        setAccountSummary(parsed.accountSummary);
      }
      if (Array.isArray(parsed.messages) && parsed.messages.length) {
        setMessages(parsed.messages.slice(-80));
      }
      setFlowMessageId(null);
    } catch {
      // ignore corrupted memory
    } finally {
      setMemoryReady(true);
    }
  }, []);

  useEffect(() => {
    if (!memoryReady) return;
    const payload: PersistedState = {
      profile,
      stage,
      positionFen,
      patternsNotes,
      statsNotes,
      accountSummary,
      messages: messages.slice(-80),
    };
    try {
      localStorage.setItem(DEEP_DIVE_STATE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage failure
    }
  }, [memoryReady, profile, stage, positionFen, patternsNotes, statsNotes, accountSummary, messages]);

  useEffect(() => {
    return () => {
      engineRef.current?.quit();
      engineRef.current = null;
      engineReadyRef.current = false;
      reviewEngineRef.current?.quit();
      reviewEngineRef.current = null;
      reviewEngineReadyRef.current = false;
    };
  }, []);

  const getEngineClient = async (): Promise<StockfishClient> => {
    let client = engineRef.current;
    if (!client) {
      client = new StockfishClientClass();
      engineRef.current = client;
      engineReadyRef.current = false;
    }
    if (!engineReadyRef.current) {
      await client.init();
      engineReadyRef.current = true;
    }
    return client;
  };

  const getReviewEngineClient = async (): Promise<StockfishClient> => {
    let client = reviewEngineRef.current;
    if (!client) {
      client = new StockfishClientClass();
      reviewEngineRef.current = client;
      reviewEngineReadyRef.current = false;
    }
    if (!reviewEngineReadyRef.current) {
      await client.init();
      reviewEngineReadyRef.current = true;
    }
    return client;
  };

  const getActiveReviewFen = (): string => {
    if (!reviewAnalysis || !reviewMoves.length) return positionFen.trim() || DEFAULT_POSITION;
    if (reviewUserLineMode) return boardRef.current?.getFen() ?? DEFAULT_POSITION;
    return reconstructFenForPly(reviewInitialFen, reviewMoves, reviewPly);
  };

  const formatEngineLine = (
    fen: string,
    line: EngineLine,
    rank: number,
  ): VisibleEngineLine | null => {
    const uci = line.pvUci.split(/\s+/)[0] ?? "";
    if (!uci) return null;
    const chess = new Chess(fen);
    const wp = engineScoreToWhitePerspective(chess.turn(), line.cp, line.mate);
    const lineSans = uciSequenceToSan(fen, line.pvUci, 8).join(" ");
    return {
      rank,
      uci,
      san: uciToSan(fen, uci) ?? uci,
      evalLabel: formatWhiteEval(wp.cpWhite, wp.mateWhite),
      lineSans,
    };
  };

  const showReviewPanelLines = (
    analysis = reviewAnalysis,
    moves = reviewMoves,
    ply = reviewPly,
    initialFen = reviewInitialFen,
  ) => {
    if (!analysis || !moves.length) return;
    const item = analysis.review[ply];
    const fen = reconstructFenForPly(initialFen, moves, ply);
    setVisibleEngineFen(fen);
    const evalPoint = analysis.evalSeries[ply];
    setVisibleEngineEval(
      evalPoint ? formatWhiteEval(evalPoint.cpWhite, evalPoint.mateWhite) : "—",
    );
    if (!item) {
      setVisibleEngineLines([]);
      return;
    }
    setVisibleEngineLines(
      item.topUcis.slice(0, 3).map((uci, idx) => ({
        rank: idx + 1,
        uci,
        san: uciToSan(fen, uci) ?? uci,
        evalLabel: idx === 0 ? "Stockfish best" : "Candidate",
        lineSans:
          idx === 0 && item.bestLineSans
            ? item.bestLineSans
            : uciSequenceToSan(fen, uci, 1).join(" ") || uci,
      })),
    );
  };

  const refreshVisibleEngineLines = async (fenOverride?: string) => {
    const seq = ++visibleEngineSeqRef.current;
    const fen = fenOverride ?? getActiveReviewFen();
    setVisibleEngineFen(fen);
    setVisibleEngineLoading(true);
    try {
      const client = await getEngineClient();
      const result = await client.analyzePosition(fen, { depth: 12, multipv: 3 });
      if (seq !== visibleEngineSeqRef.current) return;
      const chess = new Chess(fen);
      const top = result.lines
        .slice()
        .sort((a, b) => (a.multipv ?? 99) - (b.multipv ?? 99))
        .slice(0, 3);
      const formatted = top
        .map((line, i) => formatEngineLine(fen, line, i + 1))
        .filter((line): line is VisibleEngineLine => line != null);
      setVisibleEngineLines(formatted);
      const first = top[0];
      if (first) {
        const wp = engineScoreToWhitePerspective(chess.turn(), first.cp, first.mate);
        setVisibleEngineEval(formatWhiteEval(wp.cpWhite, wp.mateWhite));
      } else {
        setVisibleEngineEval("—");
      }
    } catch {
      if (seq === visibleEngineSeqRef.current) {
        setVisibleEngineEval((prev) => prev || "—");
      }
    } finally {
      if (seq === visibleEngineSeqRef.current) setVisibleEngineLoading(false);
    }
  };

  useEffect(() => {
    if (!reviewAnalysis || !reviewMoves.length) return;
    if (!reviewUserLineMode) {
      showReviewPanelLines();
    }
    void refreshVisibleEngineLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewAnalysis, reviewPly, reviewUserLineMode]);

  const fetchProfile = async (profileOverride?: CoachProfile) => {
    const p = profileOverride ?? profile;
    const user = p.username.trim();
    if (!user) return;
    setLoadingProfile(true);
    try {
      const res = await fetch(
        `/api/patterns/${p.provider}?username=${encodeURIComponent(user)}&max=${Math.max(
          10,
          Math.min(1000, p.maxGames),
        )}`,
      );
      const json = (await res.json()) as { games?: string[]; error?: string };
      if (!res.ok || !Array.isArray(json.games)) {
        throw new Error(json.error || "Could not fetch games");
      }
      const result = runStatsScan({
        pgns: json.games,
        username: user,
        maxGames: p.maxGames,
      });
      setStatsResult(result);
      const summary = summarizeStats(result);
      setAccountSummary(summary);
      pushAssistant(
        `Great, I analyzed your account (${p.provider}: ${user}).\n\n` +
          `${summary}\n\n` +
          "You can now ask things like:\n" +
          "- Why am I losing games in this opening?\n" +
          "- Give me a 2-week plan.\n" +
          "- What should I focus on as White vs Black?",
        [
          "Why am I losing games in this opening?",
          "Give me a 2-week training plan",
          "What should I focus on as White vs Black?",
          "What 3 habits should I fix first?",
        ],
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load account.";
      pushAssistant(`I couldn't fetch the account yet: ${msg}`);
    } finally {
      setLoadingProfile(false);
    }
  };

  const buildReviewContext = (): string => {
    if (!reviewAnalysis || !reviewMoves.length) return "";
    const currentIdx = reviewPly > 0 ? reviewPly - 1 : null;
    const current = currentIdx != null ? reviewAnalysis.review[currentIdx] : null;
    const beforeSelectedFen =
      currentIdx != null
        ? reconstructFenForPly(reviewInitialFen, reviewMoves, currentIdx)
        : reviewInitialFen;
    const afterSelectedFen = reconstructFenForPly(reviewInitialFen, reviewMoves, reviewPly);
    const currentFen = reviewUserLineMode ? boardRef.current?.getFen() : afterSelectedFen;
    const worstMoves = reviewAnalysis.review
      .filter((r) => r.lossCp != null && r.lossCp >= 50)
      .slice()
      .sort((a, b) => (b.lossCp ?? 0) - (a.lossCp ?? 0))
      .slice(0, 8)
      .map(
        (r) =>
          `Move ${r.moveNo} ${r.side}: ${r.playedSan} was ${r.verdict}, lost ${r.lossCp ?? "?"}cp. Best: ${r.bestSan ?? r.bestUci}.`,
      );
    const critical = reviewAnalysis.critical
      .slice(0, 8)
      .map((c) => `Move ${c.moveNo} ${c.side}: ${c.tag} — ${c.note}`);
    const selectedMove = current
      ? [
          `Selected move: Move ${current.moveNo} ${current.side} played ${current.playedSan}`,
          `Verdict: ${current.verdict}`,
          current.lossCp != null ? `Loss: ${current.lossCp}cp` : "",
          `Best move: ${current.bestSan ?? current.bestUci}`,
          current.bestLineSans ? `Best line: ${current.bestLineSans}` : "",
      current.topUcis.length
        ? `Stockfish candidate moves from the position before this move: ${current.topUcis
            .map((uci, i) => `${i + 1}. ${uciToSan(beforeSelectedFen, uci) ?? uci}`)
            .join(", ")}`
        : "",
          current.writeup ? `Existing review note: ${current.writeup}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "Selected move: start position / no move selected";

    return [
      "LOADED PGN GAME REVIEW CONTEXT",
      `Game length: ${reviewMoves.length} plies`,
      `Current ply: ${reviewPly}${reviewUserLineMode ? " (user is exploring a side line)" : ""}`,
      `Current board FEN: ${currentFen}`,
      `Position before selected move FEN: ${beforeSelectedFen}`,
      `Position after selected move FEN: ${afterSelectedFen}`,
      `Accuracy: White ${reviewAnalysis.accuracyWhite}%, Black ${reviewAnalysis.accuracyBlack}%`,
      selectedMove,
      worstMoves.length ? `Biggest mistakes/blunders:\n${worstMoves.join("\n")}` : "",
      critical.length ? `Critical moments:\n${critical.join("\n")}` : "",
      "When the user asks about this game, prioritize the selected move and the loaded review context over generic advice.",
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  const buildEngineGroundingBlock = (): string => {
    const current =
      reviewAnalysis && reviewMoves.length ? reviewAnalysis.review[reviewPly] : null;
    const previous =
      reviewAnalysis && reviewPly > 0 ? reviewAnalysis.review[reviewPly - 1] : null;
    const visibleLines = visibleEngineLines.length
      ? [
          "CURRENT VISIBLE STOCKFISH PANEL",
          `Analyzed FEN: ${visibleEngineFen}`,
          `Evaluation: ${visibleEngineEval}`,
          ...visibleEngineLines.map(
            (line) =>
              `${line.rank}. ${line.san} (${line.uci}) — ${line.evalLabel}. Line: ${line.lineSans || line.san}`,
          ),
          "The answer must explain these Stockfish suggestions in plain English. Do not invent another recommendation.",
        ].join("\n")
      : "";
    if (!current) return visibleLines;
    const currentFen = reconstructFenForPly(reviewInitialFen, reviewMoves, reviewPly);
    const candidates = current.topUcis
      .map((uci, i) => `${i + 1}. ${uciToSan(currentFen, uci) ?? uci} (${uci})`)
      .join(", ");
    return [
      "MANDATORY ENGINE GROUNDING",
      "This is the current board position, and the moves below are for the side who is about to move.",
      `Current board ply: ${reviewPly}.`,
      `Current board FEN: ${currentFen}.`,
      `Stockfish best move for the side to move is ${current.bestSan ?? current.bestUci} (${current.bestUci}).`,
      current.bestLineSans ? `Stockfish best line is: ${current.bestLineSans}.` : "",
      candidates ? `Stockfish candidate list: ${candidates}.` : "",
      previous
        ? `Previous move shown on the board was ${previous.playedSan}, verdict ${previous.verdict}${
            previous.lossCp != null ? `, loss ${previous.lossCp}cp` : ""
          }.`
        : "",
      "If the user asks for the best move now, answer with the current Stockfish best move above.",
      "If explaining the last move, use the previous move verdict. If explaining what to play next, use the current Stockfish best move.",
      visibleLines,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const learnProfileFromFreeText = (input: string) => {
    const lower = input.toLowerCase();
    const ratingMatch = lower.match(/\b(\d{3,4})\b/);
    if (ratingMatch && !profile.skillLevel) {
      setProfile((p) => ({ ...p, skillLevel: `Around ${ratingMatch[1]} rating` }));
    }
    const hoursMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
    if (hoursMatch && !profile.weeklyHours) {
      setProfile((p) => ({ ...p, weeklyHours: String(hoursMatch[1]) }));
    }
    if ((lower.includes("goal") || lower.includes("want to")) && !profile.goal) {
      setProfile((p) => ({ ...p, goal: input.slice(0, 120) }));
    }
    if (lower.includes("chess.com") && profile.provider !== "chesscom") {
      setProfile((p) => ({ ...p, provider: "chesscom" }));
    }
    if (lower.includes("lichess") && profile.provider !== "lichess") {
      setProfile((p) => ({ ...p, provider: "lichess" }));
    }
  };

  const handleOnboarding = async (
    input: string,
  ): Promise<"consumed_wait" | "consumed_ready" | "not_consumed"> => {
    const value = input.trim();
    if (!value) return "consumed_wait";

    const providerRequest = requestedProvider(value);
    const providerSwitchIntent =
      providerRequest != null &&
      (isAccountIntent(value) ||
        stage === "provider" ||
        stage === "username" ||
        stage === "ready");
    if (providerRequest && providerSwitchIntent) {
      setProfile((p) => ({ ...p, provider: providerRequest, username: "" }));
      setStage("username");
      setSuggestions(["None", "Skip onboarding"]);
      pushAssistant(
        `Sure — let's use ${providerRequest === "chesscom" ? "Chess.com" : "Lichess"} instead. What's your username there?`,
      );
      return "consumed_wait";
    }

    if (!providerRequest && isAccountIntent(value) && stage === "ready") {
      setStage("provider");
      setSuggestions(["Chess.com", "Lichess", "None"]);
      pushAssistant("Sure — which account should I analyze, Chess.com or Lichess?");
      return "consumed_wait";
    }

    if (isSkipToken(value)) {
      setStage("ready");
      setSuggestions([
        "Why am I losing games in this opening?",
        "Give me a 2-week training plan",
        "What should I focus on as White vs Black?",
      ]);
      pushAssistant(
        "No problem — skipping onboarding for now. You can chat immediately, and share your profile details anytime later.",
      );
      return "consumed_ready";
    }

    if (stage === "welcome" || stage === "skill") {
      setProfile((p) => ({ ...p, skillLevel: value }));
      setStage("goal");
      pushAssistant(
        "Nice. What is your main chess goal right now?",
        [
          "Reach 1600 rapid",
          "Stop blundering in middle game",
          "Improve opening understanding",
          "Play more confidently in endgames",
          "Skip onboarding",
        ],
      );
      return "consumed_wait";
    }

    if (stage === "goal") {
      setProfile((p) => ({ ...p, goal: value }));
      setStage("hours");
      pushAssistant("How many hours per week can you train realistically?", [
        "2",
        "4",
        "6",
        "8+",
        "Skip onboarding",
      ]);
      return "consumed_wait";
    }

    if (stage === "hours") {
      setProfile((p) => ({ ...p, weeklyHours: value }));
      setStage("provider");
      pushAssistant("Which account should I analyze first?", [
        "Chess.com",
        "Lichess",
        "None",
        "Skip onboarding",
      ]);
      return "consumed_wait";
    }

    if (stage === "provider") {
      if (isNoneToken(value)) {
        setStage("ready");
        setSuggestions([
          "Help me build a plan without account data",
          "What should I work on first?",
          "I can share my profile details now",
        ]);
        pushAssistant(
          "All good — we can continue without an account. If you want, you can connect Chess.com/Lichess later anytime.",
        );
        return "consumed_ready";
      }
      const normalized = value.toLowerCase();
      const provider: "chesscom" | "lichess" =
        normalized.includes("lichess") ? "lichess" : "chesscom";
      setProfile((p) => ({ ...p, provider }));
      setStage("username");
      pushAssistant(
        `Perfect. Send your ${provider === "chesscom" ? "Chess.com" : "Lichess"} username (or type "None").`,
      );
      return "consumed_wait";
    }

    if (stage === "username") {
      if (isNoneToken(value)) {
        setStage("ready");
        setSuggestions([
          "Help me with a training plan",
          "How do I improve my openings?",
          "I want to add account later",
        ]);
        pushAssistant("No problem — we will continue without account import for now.");
        return "consumed_ready";
      }
      setProfile((p) => ({ ...p, username: value }));
      setStage("maxGames");
      pushAssistant("How many recent games should I scan? (10-1000)", [
        "200",
        "300",
        "500",
        "1000",
        "Skip onboarding",
      ]);
      return "consumed_wait";
    }

    if (stage === "maxGames") {
      if (isNoneToken(value)) {
        setStage("ready");
        pushAssistant("Done. We skipped account scan. You can still ask for a custom training plan.");
        return "consumed_ready";
      }
      const n = Number(value);
      const maxGames = Number.isFinite(n) ? Math.max(10, Math.min(1000, Math.round(n))) : 300;
      const nextProfile = { ...profile, maxGames };
      setProfile(nextProfile);
      setStage("ready");
      setSuggestions([]);
      pushAssistant("Awesome. Analyzing your account now...");
      await fetchProfile(nextProfile);
      return "consumed_ready";
    }

    return "not_consumed";
  };

  const sendChat = async () => {
    const input = chatInput.trim();
    if (!input || chatBusy) return;
    setChatInput("");
    setMessages((prev) => [...prev, { id: uid(), role: "user", text: input }]);

    if (stage === "ready") {
      learnProfileFromFreeText(input);
    }
    const onboardingStatus = await handleOnboarding(input);
    if (onboardingStatus === "consumed_wait") return;

    setChatBusy(true);
    try {
      const contextBlock = [
        buildEngineGroundingBlock(),
        "COACH PROFILE CONTEXT",
        `Skill level: ${profile.skillLevel || "unknown"}`,
        `Goal: ${profile.goal || "unknown"}`,
        `Weekly hours: ${profile.weeklyHours || "unknown"}`,
        `Provider: ${profile.provider}`,
        `Username: ${profile.username || "unknown"}`,
        accountSummary ? `Account summary:\n${accountSummary}` : "Account summary: not loaded",
        statsNotes.trim() ? `User notes from statistics page:\n${statsNotes.trim()}` : "",
        patternsNotes.trim() ? `User notes from patterns page:\n${patternsNotes.trim()}` : "",
        buildReviewContext(),
        messages.length
          ? `Recent chat memory:\n${messages
              .slice(-8)
              .map((m) => `${m.role === "assistant" ? "Coach" : "User"}: ${m.text}`)
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const enrichedQuestion = `${input}\n\n---\n${contextBlock}`;
      const selectedReviewMove =
        reviewAnalysis && reviewMoves.length ? reviewAnalysis.review[reviewPly] : null;
      const activeFen =
        reviewAnalysis && reviewMoves.length
          ? getActiveReviewFen()
          : positionFen.trim() || DEFAULT_POSITION;
      const sideToMove = activeFen.includes(" b ") ? "black" : "white";
      const visibleTopCandidates = visibleEngineLines.map((line) => ({
        rank: line.rank,
        uci: line.uci,
        san: line.san,
        eval: line.evalLabel,
      }));
      const visibleBest = visibleEngineLines[0] ?? null;

      const reply = await fetch("/api/coach/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: enrichedQuestion,
          fen: activeFen,
          sideToMove,
          opening: null,
          whiteRating: 1500,
          blackRating: 1500,
          bestMove: visibleBest
            ? {
                san: visibleBest.san,
                uci: visibleBest.uci,
                idea: visibleBest.lineSans
                  ? `Stockfish line: ${visibleBest.lineSans}`
                  : `Stockfish eval: ${visibleBest.evalLabel}`,
              }
            : selectedReviewMove
            ? {
                san: selectedReviewMove.bestSan,
                uci: selectedReviewMove.bestUci,
                idea: selectedReviewMove.bestLineSans || selectedReviewMove.writeup,
              }
            : null,
          topCandidates: visibleTopCandidates.length
            ? visibleTopCandidates
            : selectedReviewMove
              ? selectedReviewMove.topUcis.map((uci, idx) => ({
                  rank: idx + 1,
                  uci,
                  san: uciToSan(activeFen, uci) ?? uci,
                  eval: idx === 0 ? "Stockfish best" : "Stockfish candidate",
                }))
              : [],
          askedMoveProbe: null,
          actionChecklist: [],
        }),
      });
      const data = (await reply.json()) as { answer?: string; error?: string; detail?: string };
      if (!reply.ok || !data.answer?.trim()) {
        throw new Error([data.error, data.detail].filter(Boolean).join(": ") || "No reply");
      }
      const id = uid();
      setFlowMessageId(id);
      setMessages((prev) => [
        ...prev,
        { id, role: "assistant", text: cleanCoachText(data.answer!) },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Coach reply failed.";
      pushAssistant(`I hit an issue: ${msg}`);
    } finally {
      setChatBusy(false);
    }
  };

  const parseInitialFenFromPgn = (pgn: string): string => {
    const headers = pgn.match(/\[(\w+)\s+"([^"]*)"\]/g) ?? [];
    const map: Record<string, string> = {};
    for (const h of headers) {
      const m = h.match(/\[(\w+)\s+"([^"]*)"\]/);
      if (m) map[m[1]] = m[2];
    }
    const setUp = map["SetUp"] === "1" || map["SetUp"]?.toLowerCase() === "true";
    return setUp && map["FEN"] ? map["FEN"] : DEFAULT_POSITION;
  };

  const runGameReview = async () => {
    const pgn = gamePgn.trim();
    if (!pgn) return;
    setReviewError(null);
    setReviewLoading(true);
    try {
      const chess = new Chess();
      chess.loadPgn(pgn, { strict: false });
      const hist = chess.history({ verbose: true });
      const moves: GameMove[] = hist.map((mv) => ({
        uci: `${mv.from}${mv.to}${mv.promotion ?? ""}`,
        san: mv.san,
        color: mv.color as "w" | "b",
      }));
      if (!moves.length) throw new Error("No moves found in PGN");
      const initialFen = parseInitialFenFromPgn(pgn);
      setReviewInitialFen(initialFen);
      setReviewMoves(moves);
      setReviewPly(0);
      setReviewUserLineMode(false);
      setReviewAnalysis(null);
      setReviewBoardOrientation("white");
      setVisibleEngineLines([]);
      setVisibleEngineEval("—");
      boardRef.current?.setFen(initialFen);

      const client = await getReviewEngineClient();
      const seq = ++gameReviewSeqRef.current;
      const analysis = await runFullGameReview({
        client,
        gameInitialFen: initialFen,
        gameMoves: moves,
        whiteRating: 1600,
        blackRating: 1600,
        seq,
        seqRef: gameReviewSeqRef,
      });
      if (seq !== gameReviewSeqRef.current) return;
      setReviewAnalysis(analysis);
      showReviewPanelLines(analysis, moves, 0, initialFen);
      pushAssistant(
        "Game review ready. Use Prev/Next to walk through moves and I will highlight inaccuracies, mistakes, and blunders.",
      );
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not analyze game");
    } finally {
      setReviewLoading(false);
    }
  };

  const stepReview = (delta: number) => {
    if (!reviewMoves.length) return;
    const next = Math.max(0, Math.min(reviewMoves.length, reviewPly + delta));
    setReviewPly(next);
    setReviewUserLineMode(false);
    const fen = reconstructFenForPly(reviewInitialFen, reviewMoves, next);
    boardRef.current?.setFen(fen, { animate: true });
  };

  const reviewBadge: ChessBoardProps["moveBadge"] = (() => {
    if (!reviewAnalysis || reviewPly <= 0 || reviewUserLineMode) return null;
    const idx = reviewPly - 1;
    const item = reviewAnalysis.review[idx];
    if (!item) return null;
    let kind: NonNullable<ChessBoardProps["moveBadge"]>["kind"] = "good";
    if (item.verdict === "blunder") kind = "blunder";
    else if (item.verdict === "mistake") kind = "mistake";
    else if (item.verdict === "inaccuracy") kind = "inaccuracy";
    else if (item.verdict === "missed win") kind = "miss";
    else if (item.verdict === "brilliant") kind = "brilliant";
    else if (item.verdict === "excellent") kind = "best";
    return { square: item.landedSquare, icon: "", kind };
  })();

  const reviewArrows: ChessBoardProps["analysisArrows"] = (() => {
    if (!reviewAnalysis || reviewUserLineMode) return {};
    const item = reviewAnalysis.review[reviewPly];
    if (!item) return {};
    return {
      bestUci: item.bestUci,
      coachUci: item.eloBestUci || null,
      lineUcis: item.topUcis,
    };
  })();

  return (
    <SitePageShell maxWidthClass="max-w-4xl">
      <section className="rounded-2xl border border-black/[0.08] bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-900/70">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="coach-icon-shell inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/25 to-fuchsia-500/20">
              <span className="coach-icon text-2xl" aria-hidden>
                🎓
              </span>
            </div>
            <h1 className="text-xl font-bold text-foreground">Deep Dive with ThuggyBot</h1>
          </div>
          {loadingProfile ? (
            <span className="text-xs text-violet-700 dark:text-violet-300">Analyzing account...</span>
          ) : null}
        </div>
        <p className="mb-3 text-sm text-foreground/70">
          Friendly coaching chat. Thuggy asks onboarding questions first, then gives personalized advice.
        </p>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs text-foreground/60">
            Your Deep Dive memory is saved on this device; onboarding is not required every time.
          </p>
          <button
            type="button"
            onClick={resetDeepDiveMemory}
            className="rounded-md border border-black/10 px-2 py-1 text-xs text-foreground/70 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Reset memory
          </button>
        </div>

        <label className="mb-3 block text-xs font-medium text-foreground/75">
          Position FEN (optional for position-specific answers)
          <textarea
            value={positionFen}
            onChange={(e) => setPositionFen(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-xs dark:border-white/15 dark:bg-zinc-950/70"
          />
        </label>

        <div className="h-[520px] overflow-y-auto rounded-xl border border-black/10 bg-gradient-to-b from-white to-slate-50/60 p-3 dark:border-white/10 dark:from-zinc-950 dark:to-zinc-900/90">
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={m.role === "assistant" ? "flex items-start gap-2" : ""}>
                {m.role === "assistant" ? (
                  <span
                    className="coach-icon-shell mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/25 to-fuchsia-500/20 text-lg"
                    aria-label="ThuggyBot avatar"
                    title="ThuggyBot"
                  >
                    <span className="coach-icon" aria-hidden>
                      🧑‍🏫
                    </span>
                  </span>
                ) : null}
                <div
                  className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "assistant"
                      ? "bg-violet-100 text-violet-950 dark:bg-violet-900/40 dark:text-violet-100"
                      : "ml-auto bg-sky-600 text-white"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <AssistantFlowText
                      text={m.text}
                      animate={m.id === flowMessageId}
                    />
                  ) : (
                    <span className="block">{m.text}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {suggestions.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setChatInput(s)}
                className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-foreground/80 dark:border-white/10 dark:bg-white/5"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {stage === "ready" ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-foreground/75">
              Notes from Patterns page (optional)
              <textarea
                value={patternsNotes}
                onChange={(e) => setPatternsNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-xs dark:border-white/15 dark:bg-zinc-950/70"
              />
            </label>
            <label className="text-xs font-medium text-foreground/75">
              Notes from Statistics page (optional)
              <textarea
                value={statsNotes}
                onChange={(e) => setStatsNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-xs dark:border-white/15 dark:bg-zinc-950/70"
              />
            </label>
          </div>
        ) : null}

        {statsResult ? (
          <p className="mt-2 text-xs text-foreground/65">
            Loaded {statsResult.gamesConsidered} games, skipped {statsResult.gamesSkippedNoUserColor}.
          </p>
        ) : null}

        <div className="mt-3 flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendChat();
              }
            }}
            placeholder={
              stage === "ready"
                ? "Ask anything about your openings, patterns, and training plan..."
                : "Answer Thuggy's onboarding question..."
            }
            className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-950/80"
            disabled={!memoryReady}
          />
          <button
            type="button"
            onClick={sendChat}
            disabled={chatBusy || loadingProfile || !memoryReady || !chatInput.trim()}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {chatBusy ? "Thinking..." : "Send"}
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-zinc-950/40">
          <p className="text-sm font-semibold text-foreground">Analyze a game with ThuggyBot</p>
          <p className="mt-1 text-xs text-foreground/65">
            Paste a PGN, then step through moves with mistake/blunder highlights.
          </p>
          <textarea
            value={gamePgn}
            onChange={(e) => setGamePgn(e.target.value)}
            rows={5}
            placeholder="Paste PGN here..."
            className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-xs dark:border-white/15 dark:bg-zinc-950/80"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={runGameReview}
              disabled={reviewLoading || !gamePgn.trim()}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {reviewLoading ? "Analyzing..." : "Run review"}
            </button>
            {reviewError ? <span className="text-xs text-red-600">{reviewError}</span> : null}
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-black/10 p-2 dark:border-white/10">
            <div className="grid min-w-0 gap-3 md:grid-cols-[360px_minmax(0,1fr)]">
              <div className="mx-auto w-full max-w-[360px]">
                <ChessBoard
                  ref={boardRef}
                  viewOnly={false}
                  boardOrientation={reviewBoardOrientation}
                  onOrientationChange={setReviewBoardOrientation}
                  moveBadge={reviewBadge}
                  analysisArrows={reviewArrows}
                  boardSize="min(78vw, 360px)"
                  onMove={() => {
                    setReviewUserLineMode(true);
                    window.setTimeout(() => {
                      void refreshVisibleEngineLines(boardRef.current?.getFen());
                    }, 80);
                  }}
                  onArrowNavigate={(dir) => {
                    stepReview(dir === "back" ? -1 : 1);
                  }}
                />
              </div>
              <div className="min-w-0 rounded-xl border border-black/10 bg-white/75 p-3 dark:border-white/10 dark:bg-zinc-950/45">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
                    Stockfish suggestions
                  </p>
                  {visibleEngineLoading ? (
                    <span className="text-[11px] text-violet-700 dark:text-violet-300">
                      analyzing...
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  Eval: {visibleEngineEval}
                </p>
                <div className="mt-2 max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
                  {visibleEngineLines.length ? (
                    visibleEngineLines.map((line) => (
                      <div
                        key={`${line.rank}-${line.uci}`}
                        className="min-w-0 rounded-lg border border-black/10 bg-black/[0.03] p-1.5 text-[11px] dark:border-white/10 dark:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">
                            {line.rank}. {line.san}
                          </span>
                          <span className="text-foreground/60">{line.evalLabel}</span>
                        </div>
                        <p className="mt-0.5 break-words text-foreground/65">
                          {line.lineSans || line.uci}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-foreground/55">
                      {visibleEngineLoading
                        ? "Loading engine lines..."
                        : "Review is loaded for the full PGN timeline. Step to a position to refresh engine lines."}
                    </p>
                  )}
                </div>
                <p className="mt-3 text-[11px] text-foreground/50">
                  Thuggy uses these exact Stockfish lines as the source of truth when explaining this position.
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => stepReview(-1)}
                disabled={reviewPly <= 0}
                className="rounded-md border border-black/10 px-2 py-1 text-xs disabled:opacity-40 dark:border-white/15"
              >
                Prev
              </button>
              <span className="text-xs text-foreground/70">
                Move {reviewPly} / {reviewMoves.length}
              </span>
              <button
                type="button"
                onClick={() => boardRef.current?.flip()}
                className="rounded-md border border-black/10 px-2 py-1 text-xs disabled:opacity-40 dark:border-white/15"
              >
                Flip
              </button>
              <button
                type="button"
                onClick={() => stepReview(1)}
                disabled={reviewPly >= reviewMoves.length}
                className="rounded-md border border-black/10 px-2 py-1 text-xs disabled:opacity-40 dark:border-white/15"
              >
                Next
              </button>
            </div>
            {reviewUserLineMode ? (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Free-play mode: you are exploring your own line. Use Prev/Next to jump back to reviewed game moves and mistake highlights.
              </p>
            ) : null}
            {reviewAnalysis && reviewPly > 0 ? (
              <p className="mt-2 text-xs text-foreground/70">
                {(() => {
                  const row = reviewAnalysis.review[reviewPly - 1];
                  if (!row) return "";
                  return `${row.side} ${row.playedSan}: ${row.verdict}. ${
                    row.writeup || ""
                  }`.trim();
                })()}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </SitePageShell>
  );
}
