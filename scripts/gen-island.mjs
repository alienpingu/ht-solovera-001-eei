// Deterministic island map generator. Run: node scripts/gen-island.mjs
// Produces a 10x10 iso grid of ground kinds: water (border), sand (beach
// ring), and an interior that alternates three grass variants with sparse
// sand2/dirt patches. It also bakes a decorative scatter (trees, bushes,
// rocks) onto land cells so the imported landscape pack is actually used.
// No RNG: the same input always yields the same island (determinism by
// design). The ground frame indexes live in the baked tileset produced by
// scripts/build-kenney-sheets.mjs.
import { writeFileSync, mkdirSync } from "node:fs";

const W = 10;
const H = 10;
const CX = (W - 1) / 2; // 4.5
const CY = (H - 1) / 2; // 4.5

// Landscape atlas frame names for decorative scatter. All are bottom-anchored
// iso objects that share the 132x66 base diamond, so they render on a cell
// like any building sprite (the tileset frame just adds height above it).
const TREES = ["landscapeTiles_005.png", "landscapeTiles_008.png", "landscapeTiles_012.png", "landscapeTiles_017.png", "landscapeTiles_036.png"];
const BUSHES = ["landscapeTiles_011.png", "landscapeTiles_018.png", "landscapeTiles_030.png", "landscapeTiles_033.png", "landscapeTiles_038.png", "landscapeTiles_043.png"];
const ROCKS = ["landscapeTiles_080.png", "landscapeTiles_081.png", "landscapeTiles_087.png", "landscapeTiles_090.png", "landscapeTiles_094.png", "landscapeTiles_096.png"];

// Deterministic hash for ground variety + decor selection.
const hash = (r, c) => r * 7 + c * 13;

const rows = [];
const decor = [];
for (let r = 0; r < H; r++) {
  const row = [];
  for (let c = 0; c < W; c++) {
    const dist = Math.abs(r - CY) + Math.abs(c - CX);
    const h = hash(r, c);
    let kind;
    if (dist > 6.5) {
      kind = "water"; // ocean: far corners
    } else if (dist > 4.5) {
      kind = "sand"; // beach ring around the land mass
    } else if (h % 19 === 0) {
      kind = "dirt"; // sparse red-brown patches
    } else if (h % 11 === 0) {
      kind = "sand2"; // sparse inland sand patches
    } else {
      kind = ["grass", "grass2", "grass3"][h % 3];
    }
    row.push(kind);

    // Decorative scatter on land only, sparse (~1 in 9 cells). Tall trees
    // stay on grass; bushes/rocks can sit on any land kind.
    if (kind !== "water" && h % 9 === 0) {
      const pool =
        kind === "grass" || kind === "grass2" || kind === "grass3"
          ? [TREES, BUSHES, ROCKS][h % 3]
          : [BUSHES, ROCKS][h % 2];
      const frame = pool[(h >> 2) % pool.length];
      decor.push({ row: r, col: c, frame });
    }
  }
  rows.push(row);
}

const data = { width: W, height: H, tiles: rows, decor };
mkdirSync("game/data", { recursive: true });
writeFileSync("game/data/island.json", JSON.stringify(data, null, 2) + "\n");

// ASCII preview so we can eyeball the shape from the terminal (no image needed).
console.log(
  rows
    .map((row) =>
      row.map((k) => (k === "water" ? "~" : k === "sand" || k === "sand2" ? "." : k === "dirt" ? "x" : "#")).join(""),
    )
    .join("\n"),
);
console.log(`\nWrote game/data/island.json (${W}x${H}, ${decor.length} decor items)`);