export type EngineLine = {
  multipv: number;
  cp?: number;
  mate?: number;
  pvUci: string;
};

export type AnalysisResult = {
  bestUci: string;
  ponderUci?: string;
  lines: EngineLine[];
};

function parseInfoLine(line: string): EngineLine | null {
  const multipvMatch = line.match(/\bmultipv (\d+)\b/);
  const multipv = multipvMatch ? Number(multipvMatch[1]) : 1;
  let cp: number | undefined;
  let mate: number | undefined;
  const scoreCp = line.match(/\bscore cp ([-\d]+)\b/);
  const scoreMate = line.match(/\bscore mate ([-\d]+)\b/);
  if (scoreCp) cp = Number(scoreCp[1]);
  if (scoreMate) mate = Number(scoreMate[1]);
  const pvMatch = line.match(/\bpv (.+)$/);
  if (!pvMatch) return null;
  return { multipv, cp, mate, pvUci: pvMatch[1].trim() };
}

function parseBestMove(line: string): { best: string; ponder?: string } | null {
  const m = line.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)(?: ([a-h][1-8][a-h][1-8][qrbn]?))?/);
  if (!m) return null;
  return { best: m[1], ponder: m[2] };
}

export class StockfishClient {
  private worker: Worker | null = null;
  private readonly queue: string[] = [];
  private waiters: Array<(line: string) => void> = [];

  async init(): Promise<void> {
    this.worker = new Worker("/stockfish/stockfish-18-lite-single.js");
    this.worker.onmessage = (e: MessageEvent<string>) => {
      const raw = typeof e.data === "string" ? e.data : String(e.data);
      for (const line of raw.split("\n").filter(Boolean)) {
        if (this.waiters.length > 0) {
          this.waiters.shift()!(line);
        } else {
          this.queue.push(line);
        }
      }
    };

    this.post("uci");
    await this.untilLine((l) => l === "uciok");

    this.post("isready");
    await this.untilLine((l) => l === "readyok");
  }

  quit(): void {
    this.worker?.postMessage("quit");
    this.worker?.terminate();
    this.worker = null;
    this.waiters = [];
    this.queue.length = 0;
  }

  private post(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  private nextLine(): Promise<string> {
    if (this.queue.length > 0) return Promise.resolve(this.queue.shift()!);
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private async untilLine(match: (line: string) => boolean): Promise<string> {
    while (true) {
      const line = await this.nextLine();
      if (match(line)) return line;
    }
  }

  private async drainReady(): Promise<void> {
    this.post("isready");
    await this.untilLine((l) => l === "readyok");
  }

  async analyzePosition(
    fen: string,
    opts: { depth: number; multipv: number },
  ): Promise<AnalysisResult> {
    if (!this.worker) throw new Error("Stockfish not initialized");

    this.post("setoption name UCI_LimitStrength value false");
    await this.drainReady();

    this.post(`setoption name MultiPV value ${opts.multipv}`);
    await this.drainReady();

    this.post(`position fen ${fen}`);
    this.post(`go depth ${opts.depth}`);

    const engineLines = new Map<number, EngineLine>();
    let bestUci = "";
    let ponderUci: string | undefined;

    while (true) {
      const line = await this.nextLine();
      if (line.startsWith("info ") && line.includes(" pv ")) {
        const parsed = parseInfoLine(line);
        if (parsed) engineLines.set(parsed.multipv, parsed);
      }
      const bm = parseBestMove(line);
      if (bm) {
        bestUci = bm.best;
        ponderUci = bm.ponder;
        break;
      }
    }

    const sorted = [...engineLines.values()].sort((a, b) => a.multipv - b.multipv);
    return {
      bestUci,
      ponderUci,
      lines: sorted.length > 0 ? sorted : [],
    };
  }

  /** Suggested move when the engine plays at roughly `elo` strength. */
  async bestMoveAtElo(fen: string, elo: number, depth: number): Promise<string> {
    if (!this.worker) throw new Error("Stockfish not initialized");

    this.post("setoption name UCI_LimitStrength value true");
    await this.drainReady();
    this.post(`setoption name UCI_Elo value ${Math.round(Math.max(800, Math.min(2800, elo)))}`);
    await this.drainReady();
    this.post("setoption name MultiPV value 1");
    await this.drainReady();

    this.post(`position fen ${fen}`);
    this.post(`go depth ${depth}`);

    while (true) {
      const line = await this.nextLine();
      const bm = parseBestMove(line);
      if (bm) return bm.best;
    }
  }
}
