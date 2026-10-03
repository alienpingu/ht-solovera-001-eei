// Deterministic island map generator. Run: node scripts/gen-island.mjs
//
// Produces a 30x30 iso grid of two ground kinds: a grass landmass with a
// rounded, natural coastline sitting in a 2-cell water ring. The coast is
// shaped by a deterministic value-noise field (integer hash of cell coords,
// bilinearly interpolated) — no Math.random, no seed, so the same input
// always yields the same island. There is no separate ground/decoration
// split: every cell is one tile (see game/data/tiles.ts). The frame each
// kind maps to lives in TILE_FRAME, so this generator never mentions art.
import { writeFileSync, mkdirSync } from "node:fs";

const W = 30;
const H = 30;
const RING = 2; // water cells deep around the border
const CX = (W - 1) / 2; // 14.5
const CY = (H - 1) / 2; // 14.5

const BASE = 11.5; // coastline radius at zero noise
const JITTER = 4; // noise swings the coast +/- this many cells
const CORE = 7; // always-land inside this radius (no enclosed ponds)
const FEATURE = 3; // value-noise lattice size in cells (bigger = smoother)

// Deterministic hash of a cell -> [0,1). Splitmix-style so neighbouring
// lattice points get uncorrelated values while staying seed-free.
function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Bilinear value noise with smoothstep: a low-frequency field so the coast
// reads as rounded bays and peninsulas, not per-cell static.
function noise(r, c) {
  const x0 = Math.floor(c / FEATURE);
  const y0 = Math.floor(r / FEATURE);
  const fx = c / FEATURE - x0;
  const fy = r / FEATURE - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = hash(x0, y0);
  const v10 = hash(x0 + 1, y0);
  const v01 = hash(x0, y0 + 1);
  const v11 = hash(x0 + 1, y0 + 1);
  return (v00 + (v10 - v00) * sx) * (1 - sy) + (v01 + (v11 - v01) * sx) * sy;
}

const rows = [];
for (let r = 0; r < H; r++) {
  const row = [];
  for (let c = 0; c < W; c++) {
    if (r < RING || r >= H - RING || c < RING || c >= W - RING) {
      row.push("water");
      continue;
    }
    const dist = Math.hypot(r - CY, c - CX);
    if (dist <= CORE) {
      row.push("grass");
      continue;
    }
    const radius = BASE + (noise(r, c) - 0.5) * JITTER;
    row.push(dist < radius ? "grass" : "water");
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