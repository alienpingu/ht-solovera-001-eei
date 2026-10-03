// Deterministic island map generator. Run: node scripts/gen-island.mjs
//
// Produces a 10x10 iso grid of two ground kinds: grass in the middle and
// water around it. No RNG and no decoration — the same input always yields
// the same island. There is no separate ground/decoration split: every cell
// is one tile (see game/data/tiles.ts). The frame each kind maps to lives in
// TILE_FRAME, so this generator never mentions art.
import { writeFileSync, mkdirSync } from "node:fs";

const W = 10;
const H = 10;
const CX = (W - 1) / 2; // 4.5
const CY = (H - 1) / 2; // 4.5
const WATER_DIST = 6.5; // Manhattan radius from centre; beyond it is ocean

const rows = [];
for (let r = 0; r < H; r++) {
  const row = [];
  for (let c = 0; c < W; c++) {
    const dist = Math.abs(r - CY) + Math.abs(c - CX);
    row.push(dist > WATER_DIST ? "water" : "grass");
  }
  rows.push(row);
}

const data = { width: W, height: H, tiles: rows };
mkdirSync("game/data", { recursive: true });
writeFileSync("game/data/island.json", JSON.stringify(data, null, 2) + "\n");

// ASCII preview so the shape is eyeballable from the terminal (no image needed).
console.log(
  rows.map((row) => row.map((k) => (k === "water" ? "~" : "#")).join("")).join("\n"),
);
console.log(`\nWrote game/data/island.json (${W}x${H})`);
