// Deterministic Kenney asset bake. Run: node scripts/build-kenney-sheets.mjs
//
// Extracts the ground-diamond frames out of the "Isometric Tiles Landscape"
// spritesheet and repacks them into ONE uniform 132x83 tileset
// (public/assets/tiles/ground-sheet.png). Phaser's iso Tilemap layer slices
// it with tileWidth=132 / tileHeight=83 and nests it with tileOffset.y=1: the
// visible TOP FACE is a 132x66 diamond at frame y=1..67 (top vertex y=1,
// widest y=34, bottom vertex y=67), and y=68..81 is the soil side. Anchoring
// that top face (not the soil bottom) is what keeps the ground grid exactly
// on the game's 66px iso rows.
//
// The landscape pack ships unlabeled landscapeTiles_000..127; the frame
// indexes below were picked by pixel analysis (avg color + row-extent
// geometry, see the project skill). The kind->frame order here is the single
// source of truth for GROUND_SHEET_INDEX in game/data/tiles.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const SHEET_PATH = "public/assets/kenney/isometric-landscape/landscapeTiles_sheet.png";
const ATLAS_PATH = "public/assets/kenney/isometric-landscape/landscapeTiles_sheet.xml";
const OUT_PATH = "public/assets/tiles/ground-sheet.png";

const FRAME_W = 132; // uniform tileset frame (the 132x66 diamond + its 17px frame)
const FRAME_H = 83; // matches every Kenney ground frame height
const COLS = 4; // sheet grid columns (rows are implied)

// kind -> landscapeTiles_NNN index. Sheet tile index = row * COLS + col.
const GROUND_FRAMES = {
  water: 44, // pale aqua (the pack has no deep-blue ocean; verified by analysis)
  sand: 14,
  sand2: 20,
  grass: 0,
  grass2: 2,
  grass3: 3,
  dirt: 73,
};

const atlas = readFileSync(ATLAS_PATH, "utf8");
const sheet = PNG.sync.read(readFileSync(SHEET_PATH));

// Parse the TexturePacker <SubTexture> rects into name -> { x, y, w, h }.
const frames = new Map();
for (const match of atlas.matchAll(/<SubTexture name="([^"]+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*>/g)) {
  frames.set(match[1], {
    x: parseInt(match[2], 10),
    y: parseInt(match[3], 10),
    w: parseInt(match[4], 10),
    h: parseInt(match[5], 10),
  });
}

const kinds = Object.keys(GROUND_FRAMES);
const rows = Math.ceil(kinds.length / COLS);
const out = new PNG({ width: COLS * FRAME_W, height: rows * FRAME_H });

const report = [];
kinds.forEach((kind, i) => {
  const name = `landscapeTiles_${String(GROUND_FRAMES[kind]).padStart(3, "0")}.png`;
  const frame = frames.get(name);
  if (!frame) throw new Error(`Missing frame ${name} in landscape atlas`);
  if (frame.h !== FRAME_H) {
    throw new Error(`${name} is ${frame.h}px tall, expected ${FRAME_H} — not a ground diamond`);
  }

  // Some ground frames are 133 wide with a 1px transparent column; crop the
  // 132-wide diamond so every tile sits at the same x in the sheet.
  const cropX = frame.w - FRAME_W;
  const col = i % COLS;
  const row = Math.floor(i / COLS);

  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const s = ((frame.y + y) * sheet.width + frame.x + cropX + x) * 4;
      const d = ((row * FRAME_H + y) * out.width + col * FRAME_W + x) * 4;
      out.data[d] = sheet.data[s];
      out.data[d + 1] = sheet.data[s + 1];
      out.data[d + 2] = sheet.data[s + 2];
      out.data[d + 3] = sheet.data[s + 3];
    }
  }

  // Average color + opaque bbox of the baked tile, for a visual QA report.
  let r = 0, g = 0, b = 0, n = 0;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const d = ((row * FRAME_H + y) * out.width + col * FRAME_W + x) * 4;
      if (out.data[d + 3] > 128) {
        r += out.data[d]; g += out.data[d + 1]; b += out.data[d + 2]; n++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  report.push(
    `${String(i).padStart(2)} ${kind.padEnd(7)} <- ${name} bbox=(${minX},${minY},${maxX},${maxY}) avg=${[Math.round(r/n), Math.round(g/n), Math.round(b/n)].join(",")}`,
  );
});

writeFileSync(OUT_PATH, PNG.sync.write(out));
console.log(report.join("\n"));
console.log(`\nWrote ${OUT_PATH} (${out.width}x${out.height}, ${kinds.length} tiles)`);