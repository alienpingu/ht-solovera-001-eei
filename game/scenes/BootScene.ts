import Phaser from "phaser";
import { ISO, BUILDING_DEFS, DECOR } from "@/game/data/tiles";

/**
 * BootScene: preload the Kenney isometric packs and bake the procedural
 * textures the packs lack (build-ghost highlights) into the texture cache
 * before the MainScene ever touches them.
 *
 * Both Kenney packs load as TexturePacker XML atlases, so every frame is
 * available by its sheet name (e.g. "landscapeTiles_005.png",
 * "buildingTiles_081.png"). The ground grid is rendered from a single uniform
 * tileset (ground-sheet.png) baked by scripts/build-kenney-sheets.mjs.
 *
 * The ghost diamonds must share the SAME 132x66 bottom-anchored geometry as
 * the Kenney ground tiles or they will not nest visually.
 */

/**
 * Ghost diamonds must nest with the Kenney ground tiles, so they copy the
 * MEASURED geometry of the art: a 132x66 diamond inside a 132x83 frame.
 * Pixel analysis of the landscape tiles shows the ground art actually spans
 * y=1..81 (top vertex y=1, widest row ~y=41, bottom vertex y=81) — the
 * frame's bottom edge is the anchor, matching how the renderer places tiles.
 */
const DIAMOND_FRAME_W = ISO.TILE_W; // 132
const DIAMOND_FRAME_H = ISO.TILE_H + 17; // 83, matches the Kenney PNG frames
const TOP_Y = 1; // measured top vertex of the ground art
const WIDEST_Y = ISO.TILE_H / 2 + 8; // 41, mid of the measured y=1..81 span
const BOT_Y = ISO.TILE_H + 15; // 81, measured bottom vertex

const DIAMOND_POINTS = [
  { x: DIAMOND_FRAME_W / 2, y: TOP_Y }, // top vertex
  { x: DIAMOND_FRAME_W, y: WIDEST_Y }, // right vertex
  { x: DIAMOND_FRAME_W / 2, y: BOT_Y }, // bottom vertex
  { x: 0, y: WIDEST_Y }, // left vertex
] as const;

function drawDiamond(
  g: Phaser.GameObjects.Graphics,
  color: number,
  alpha: number,
  stroke?: number,
): void {
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(DIAMOND_POINTS[0].x, DIAMOND_POINTS[0].y);
  for (let i = 1; i < DIAMOND_POINTS.length; i++) {
    g.lineTo(DIAMOND_POINTS[i].x, DIAMOND_POINTS[i].y);
  }
  g.closePath();
  g.fillPath();
  if (stroke !== undefined) {
    g.lineStyle(2, stroke, alpha);
    g.strokePath();
  }
}

function makeGhostTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  drawDiamond(g, 0x3ddc84, 0.5, 0x1f9d57);
  g.generateTexture("ghost-ok", DIAMOND_FRAME_W, DIAMOND_FRAME_H);
  g.clear();
  drawDiamond(g, 0xff5a5a, 0.5, 0xb0231e);
  g.generateTexture("ghost-bad", DIAMOND_FRAME_W, DIAMOND_FRAME_H);
  g.destroy();
}

/**
 * Stand-in for any atlas frame that fails to resolve. Phaser's own fallback is
 * a black square with a green cross, which is easy to mistake for real art and
 * tells you nothing; this one is a deliberate grey diamond so a missing frame
 * is obvious but never breaks the layout while debugging.
 */
function makePlaceholderTexture(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  drawDiamond(g, 0x9aa4b2, 0.9, 0x4b5563);
  g.generateTexture("placeholder", DIAMOND_FRAME_W, DIAMOND_FRAME_H);
  g.destroy();
}

/**
 * Warn (once per bad frame) when a def points at a frame the atlas doesn't
 * have. Catches the exact regression that used to render as green crosses:
 * a texture key / frame name mismatch after an atlas or data edit.
 */
function validateAtlasFrames(scene: Phaser.Scene): void {
  const check = (sheet: string, frame: string): void => {
    const texture = scene.textures.get(sheet);
    if (!texture || !texture.has(frame)) {
      console.warn(`[assets] missing frame "${frame}" in atlas "${sheet}"`);
    }
  };
  for (const kind of Object.keys(BUILDING_DEFS) as (keyof typeof BUILDING_DEFS)[]) {
    check(BUILDING_DEFS[kind].sheet, BUILDING_DEFS[kind].texture);
  }
  for (const d of DECOR) check("landscape", d.frame);
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    // Kenney "Isometric Tiles Landscape" / "Buildings" (CC0) as TexturePacker
    // XML atlases (load.atlas is the JSON loader — these packs ship XML, so
    // use atlasXML). Frames keep the atlas names, e.g.
    // "landscapeTiles_005.png" or "buildingTiles_081.png". See
    // public/assets/kenney/*/LICENSE.txt.
    this.load.atlasXML(
      "landscape",
      "/assets/kenney/isometric-landscape/landscapeTiles_sheet.png",
      "/assets/kenney/isometric-landscape/landscapeTiles_sheet.xml",
    );
    this.load.atlasXML(
      "buildings",
      "/assets/kenney/isometric-buildings/buildingTiles_sheet.png",
      "/assets/kenney/isometric-buildings/buildingTiles_sheet.xml",
    );
    this.load.image("ground-sheet", "/assets/tiles/ground-sheet.png");
  }

  create(): void {
    makeGhostTextures(this);
    makePlaceholderTexture(this);
    validateAtlasFrames(this);
    this.scene.start("MainScene");
  }
}