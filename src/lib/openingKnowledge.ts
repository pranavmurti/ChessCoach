export type OpeningSide = "white" | "black";

type OpeningDoc = {
  name: string;
  aliases: string[];
  family: string;
  whiteIdeas: string[];
  blackIdeas: string[];
  pawnBreaks: string[];
  tacticalMotifs: string[];
  pitfalls: string[];
};

const OPENING_PRINCIPLES = [
  "Control central squares early with pawns and pieces.",
  "Develop minor pieces before launching wing attacks.",
  "Castle in time and coordinate rooks.",
  "Use pawn breaks only when piece support is ready.",
];

const OPENING_DOCS: OpeningDoc[] = [
  {
    name: "Sicilian Defense",
    aliases: ["sicilian", "najdorf", "dragon", "scheveningen"],
    family: "Semi-Open",
    whiteIdeas: [
      "Build central pressure with d4 and active piece play.",
      "Use kingside initiative after development is complete.",
    ],
    blackIdeas: [
      "Fight for d4 and ...d5 break timing.",
      "Counterplay on queenside while keeping king safety stable.",
    ],
    pawnBreaks: ["d4", "...d5", "...b5"],
    tacticalMotifs: ["Exchange sacrifice on c3", "Thematic kingside attacks"],
    pitfalls: ["Attacking before king safety", "Ignoring central tension"],
  },
  {
    name: "French Defense",
    aliases: ["french", "winawer", "tarrasch", "advance french"],
    family: "Semi-Open",
    whiteIdeas: [
      "Use space and central chain pressure.",
      "Improve the light-squared bishop via b3-a2 or d3-e2 routes.",
    ],
    blackIdeas: [
      "Pressure d4 and challenge center with ...c5 and ...f6.",
      "Trade passive pieces for active defenders.",
    ],
    pawnBreaks: ["c4", "...c5", "...f6"],
    tacticalMotifs: ["Kingside pawn storms", "Center undermining tactics"],
    pitfalls: ["Locking center without plan", "Premature piece trades"],
  },
  {
    name: "Caro-Kann Defense",
    aliases: ["caro", "caro-kann", "classical caro", "advance caro"],
    family: "Semi-Open",
    whiteIdeas: [
      "Take space while keeping structure healthy.",
      "Choose between long-term squeeze and direct initiative.",
    ],
    blackIdeas: [
      "Stay solid and complete development smoothly.",
      "Seek ...c5 or ...e5 breaks once coordinated.",
    ],
    pawnBreaks: ["c4", "...c5", "...e5"],
    tacticalMotifs: ["Minor-piece pressure on e4/d4", "Endgame transitions"],
    pitfalls: ["Passive setup with no counterplay", "Overextension without support"],
  },
  {
    name: "Ruy Lopez",
    aliases: ["ruy", "spanish", "ruy lopez"],
    family: "Open Game",
    whiteIdeas: [
      "Sustain pressure on e5 and improve piece harmony.",
      "Play c3-d4 when development allows.",
    ],
    blackIdeas: [
      "Challenge center and activate queenside pieces.",
      "Time ...d5 breaks and avoid cramped passivity.",
    ],
    pawnBreaks: ["d4", "...d5", "...f5 (some lines)"],
    tacticalMotifs: ["Pin pressure on c6/e5", "Kingside mating nets"],
    pitfalls: ["Trading center control for early tactics", "Neglecting queenside development"],
  },
  {
    name: "Italian Game",
    aliases: ["italian", "giuoco", "evans gambit"],
    family: "Open Game",
    whiteIdeas: [
      "Fast development and central control.",
      "Build kingside initiative after castling.",
    ],
    blackIdeas: [
      "Neutralize tactical ideas and strike center at right moment.",
      "Coordinate minor pieces before pawn adventures.",
    ],
    pawnBreaks: ["d4", "...d5", "c3-c4 (in some structures)"],
    tacticalMotifs: ["F7 pressure", "Sacrifices on e6/f7"],
    pitfalls: ["One-move attacks with undeveloped pieces", "Ignoring tactical checks"],
  },
  {
    name: "Scotch Game",
    aliases: ["scotch"],
    family: "Open Game",
    whiteIdeas: [
      "Open center quickly for active pieces.",
      "Use lead in development to create forcing play.",
    ],
    blackIdeas: [
      "Simplify when under pressure and finish development.",
      "Use central pawn structure to equalize activity.",
    ],
    pawnBreaks: ["d4", "...d5"],
    tacticalMotifs: ["Central forks", "Tempo gains on queen sorties"],
    pitfalls: ["Overpushing center pawns", "Lagging king safety"],
  },
  {
    name: "Queen's Gambit",
    aliases: ["queen's gambit", "qg", "qgd", "qga"],
    family: "Closed",
    whiteIdeas: [
      "Pressure center and gain queenside space.",
      "Improve minor pieces before pawn breaks.",
    ],
    blackIdeas: [
      "Stabilize d5 and solve c8 bishop development.",
      "Counter with ...c5 or ...e5 when prepared.",
    ],
    pawnBreaks: ["e4", "...c5", "...e5"],
    tacticalMotifs: ["Minority attack themes", "Isolated pawn pressure"],
    pitfalls: ["Automatic captures that lose structure", "Passive piece placement"],
  },
  {
    name: "Slav Defense",
    aliases: ["slav", "semi-slav"],
    family: "Closed",
    whiteIdeas: [
      "Claim central space and avoid unnecessary simplification.",
      "Use queenside development lead to press long-term.",
    ],
    blackIdeas: [
      "Solid pawn chain and active light-squared bishop plans.",
      "Counter center with ...c5 or ...e5 setups.",
    ],
    pawnBreaks: ["e4", "...c5", "...e5"],
    tacticalMotifs: ["Central pawn tension tactics", "Queenside piece activity"],
    pitfalls: ["Releasing tension too early", "Misplacing queenside knight"],
  },
  {
    name: "King's Indian Defense",
    aliases: ["king's indian", "kid"],
    family: "Indian Defense",
    whiteIdeas: [
      "Use space advantage and central expansion.",
      "Choose queenside play against black kingside attack.",
    ],
    blackIdeas: [
      "Prepare kingside attack with ...f5 and piece lift.",
      "Keep central counterplay and avoid getting squeezed.",
    ],
    pawnBreaks: ["c5", "...f5", "...e5"],
    tacticalMotifs: ["Kingside pawn storms", "Exchange sacrifices for attack"],
    pitfalls: ["Attacking without piece support", "Allowing center collapse"],
  },
  {
    name: "Grunfeld Defense",
    aliases: ["grunfeld", "gruenfeld"],
    family: "Indian Defense",
    whiteIdeas: [
      "Use center space but watch overextension.",
      "Convert space into development and king safety.",
    ],
    blackIdeas: [
      "Attack white center with piece pressure and ...c5.",
      "Use activity over structure.",
    ],
    pawnBreaks: ["e4", "...c5", "...e5"],
    tacticalMotifs: ["Central pawn liquidation", "Active queen and bishop pressure"],
    pitfalls: ["Overextending center", "Underestimating piece activity"],
  },
  {
    name: "Nimzo-Indian Defense",
    aliases: ["nimzo", "nimzo-indian"],
    family: "Indian Defense",
    whiteIdeas: [
      "Handle doubled pawns dynamically and use bishop pair chances.",
      "Play for central expansion with timely e4.",
    ],
    blackIdeas: [
      "Control dark squares and pressure c4/e4.",
      "Use structural pressure and piece activity.",
    ],
    pawnBreaks: ["e4", "...c5", "...d5"],
    tacticalMotifs: ["Pin and pressure on c3", "Central tactic motifs on e4"],
    pitfalls: ["Over-fixing structure", "Ignoring king safety while grabbing pawns"],
  },
  {
    name: "London System",
    aliases: ["london"],
    family: "System Opening",
    whiteIdeas: [
      "Stable development with Bf4/e3/Nf3/c3 setup.",
      "Switch between slow squeeze and kingside pressure.",
    ],
    blackIdeas: [
      "Challenge setup with ...c5 and active queenside development.",
      "Avoid passive mirroring; contest center actively.",
    ],
    pawnBreaks: ["e4", "c4", "...c5"],
    tacticalMotifs: ["Greek gift patterns", "Pressure on e6/h7"],
    pitfalls: ["Autopilot setup with no central reaction", "Delayed development of queenside pieces"],
  },
  {
    name: "English Opening",
    aliases: ["english", "1.c4"],
    family: "Flank Opening",
    whiteIdeas: [
      "Flexible setup with central control by pieces and pawns.",
      "Transpose into favorable structures.",
    ],
    blackIdeas: [
      "Occupy center and avoid drifting into passive setups.",
      "Respond to white flexibility with active development.",
    ],
    pawnBreaks: ["d4", "b4", "...d5", "...e5"],
    tacticalMotifs: ["Long diagonal pressure", "Queenside expansion tactics"],
    pitfalls: ["Slow development", "Unclear plan in quiet positions"],
  },
  {
    name: "Reti Opening",
    aliases: ["reti", "1.nf3"],
    family: "Flank Opening",
    whiteIdeas: [
      "Delay central commitments and choose structure later.",
      "Pressure center with pieces first.",
    ],
    blackIdeas: [
      "Take central space but maintain flexibility.",
      "Do not overextend center without piece support.",
    ],
    pawnBreaks: ["c4", "d4", "...c5", "...e5"],
    tacticalMotifs: ["Transpositional tactical themes", "Central overextension punishment"],
    pitfalls: ["Aimless waiting moves", "Ignoring concrete central claims"],
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, " ");
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function docScore(doc: OpeningDoc, question: string, openingLabel?: string | null) {
  const qTokens = new Set(tokens(question));
  const names = [doc.name, ...doc.aliases, doc.family].join(" ").toLowerCase();
  let score = 0;

  for (const t of qTokens) {
    if (names.includes(t)) score += 2;
  }

  const lowerLabel = openingLabel?.toLowerCase() ?? "";
  if (lowerLabel.includes(doc.name.toLowerCase())) score += 10;
  for (const a of doc.aliases) {
    if (lowerLabel.includes(a.toLowerCase())) score += 6;
  }
  return score;
}

export function buildOpeningGuidance(
  question: string,
  openingLabel: string | null,
  side: OpeningSide,
  userElo: number,
): string {
  const ranked = OPENING_DOCS.map((doc) => ({
    doc,
    score: docScore(doc, question, openingLabel),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const base =
    userElo < 1200
      ? "Keep plans simple: king safety, complete development, then one pawn break."
      : userElo < 1800
        ? "Use one strategic plan plus one concrete tactical check each move."
        : "Balance strategic plan with concrete calculation every move.";

  if (!ranked.length) {
    return [
      openingLabel
        ? `Opening context: ${openingLabel}.`
        : "Opening context: no exact book name found.",
      `Core principles: ${OPENING_PRINCIPLES.join(" ")}`,
      base,
    ].join(" ");
  }

  const sideIdeas = ranked
    .map(({ doc }) => {
      const ideas = side === "white" ? doc.whiteIdeas : doc.blackIdeas;
      return [
        `${doc.name} (${doc.family})`,
        `Plan: ${ideas.join(" ")}`,
        `Pawn breaks: ${doc.pawnBreaks.join(", ")}.`,
        `Tactics: ${doc.tacticalMotifs.join("; ")}.`,
        `Avoid: ${doc.pitfalls.join("; ")}.`,
      ].join(" ");
    })
    .join(" ");

  return [
    openingLabel ? `Opening context: ${openingLabel}.` : "",
    sideIdeas,
    base,
  ]
    .filter(Boolean)
    .join(" ");
}

