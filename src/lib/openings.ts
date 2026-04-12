export type OpeningInfo = {
  eco: string;
  name: string;
  moves: string | string[];
};

let cachedCodes: Record<string, OpeningInfo> | null = null;

export async function lookupOpening(fen: string): Promise<OpeningInfo | null> {
  try {
    if (!cachedCodes) {
      const mod: any = await import("chess-openings/dist/chess/openings/eco.js");
      const eco = mod?.eco ?? mod?.default?.eco ?? {};
      const normalized: Record<string, OpeningInfo> = {};
      for (const [k, v] of Object.entries(eco as Record<string, any>)) {
        normalized[k] = {
          eco: v.eco,
          name: v.name,
          moves: Array.isArray(v.moves) ? v.moves : [String(v.moves ?? "")],
        };
      }
      cachedCodes = normalized;
    }
    const exact = cachedCodes[fen];
    if (exact) return exact;
    // Fallback: ignore halfmove/fullmove counters for broader matching.
    const key = fen.split(" ").slice(0, 4).join(" ");
    for (const [k, v] of Object.entries(cachedCodes)) {
      if (k.split(" ").slice(0, 4).join(" ") === key) return v;
    }
    return null;
  } catch {
    // backup to old package if needed
    try {
      const mod: any = await import("chess-eco-codes/codes.json");
      cachedCodes = (mod?.default ?? mod) as Record<string, OpeningInfo>;
      const exact = cachedCodes[fen];
      if (exact) return exact;
      const key = fen.split(" ").slice(0, 4).join(" ");
      for (const [k, v] of Object.entries(cachedCodes)) {
        if (k.split(" ").slice(0, 4).join(" ") === key) return v;
      }
      return null;
    } catch {
      return null;
    }
  }
}

