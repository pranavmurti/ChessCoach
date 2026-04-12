import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const bin = path.join(root, "node_modules", "stockfish", "bin");
const dest = path.join(root, "public", "stockfish");

const FILES = ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"];

if (!fs.existsSync(bin)) {
  console.warn("copy-stockfish: stockfish bin missing, skip");
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
for (const f of FILES) {
  const src = path.join(bin, f);
  if (!fs.existsSync(src)) {
    console.warn(`copy-stockfish: missing ${f}, skip`);
    continue;
  }
  fs.copyFileSync(src, path.join(dest, f));
}
console.log("copy-stockfish: synced lite-single engine to public/stockfish");
