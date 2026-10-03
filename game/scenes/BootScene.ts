import Phaser from "phaser";
import { ISO, BUILDING_DEFS } from "@/game/data/tiles";

/**
 * BootScene: preload the Kenney isometric packs and bake the procedural
 * textures the packs lack (build-ghost highlights) into the texture cache
 * before the MainScene ever touches them.
 *
 * Both Kenney packs load as TexturePacker XML atlases, so every frame is
 * available by its sheet name (e.g. "landscapeTiles_005.png",
 * "buildingTiles_081.png"). The ground is drawn straight from the landscape
 * atlas by MainScene — there is no baked ground tileset.
 *
 * The ghost diamonds copy the ground art's 132x66 TOP FACE (frame y=1..67 of
 * an 83px frame) so they nest with the ground sprites.
 */

/**
 * Iso diamond geometry, in pixels, measured from the Kenney ground art.
 *
 * Each ground frame is a 132x83 block: the visible TOP FACE is a 132x66
 * diamond at frame y=1..67 (top vertex y=1, widest y=34, bottom vertex y=67),
 * and y=68..81 is the soil side. Ghost highlights copy the TOP FACE so they
 * nest with the ground sprites (MainScene.renderTiles anchors that top face to
 * the game grid; the soil side is hidden by the tile in front).
 */
const DIAMOND_FRAME_W = ISO.TILE_W; // 132
const DIAMOND_FRAME_H = ISO.TILE_H + 17; // 83, matches the Kenney PNG frames
const TOP_Y = 1; // measured top vertex of the ground top face
const WIDEST_Y = TOP_Y + ISO.TILE_H / 2; // 34
const BOT_Y = TOP_Y + ISO.TILE_H; // 67, top-face bottom vertex

const GHOST_POINTS = [
  { x: DIAMOND_FRAME_W / 2, y: TOP_Y }, // top vertex
  { x: DIAMOND_FRAME_W, y: WIDEST_Y }, // right vertex
  { x: DIAMOND_FRAME_W / 2, y: BOT_Y }, // bottom vertex
  { x: 0, y: WIDEST_Y }, // left vertex
] as const;

/**
 * Placeholder footprint: a bottom-anchored 132x66 diamond so a missing object
 * frame sits on its cell like a real building sprite (origin 0.5,1) instead of
 * floating 16px up.
 */
const PLACEHOLDER_TOP_Y = DIAMOND_FRAME_H - 1 - ISO.TILE_H; // 16
const PLACEHOLDER_WIDEST_Y = PLACEHOLDER_TOP_Y + ISO.TILE_H / 2; // 49
const PLACEHOLDER_BOT_Y = DIAMOND_FRAME_H - 1; // 82
const PLACEHOLDER_POINTS = [
  { x: DIAMOND_FRAME_W / 2, y: PLACEHOLDER_TOP_Y },
  { x: DIAMOND_FRAME_W, y: PLACEHOLDER_WIDEST_Y },
  { x: DIAMOND_FRAME_W / 2, y: PLACEHOLDER_BOT_Y },
  { x: 0, y: PLACEHOLDER_WIDEST_Y },
] as const;

function drawDiamond(
  g: Phaser.GameObjects.Graphics,
  points: readonly { x: number; y: number }[],
  color: number,
  alpha: number,
  stroke?: number,
): void {
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    g.lineTo(points[i].x, points[i].y);
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
  drawDiamond(g, GHOST_POINTS, 0x3ddc84, 0.5, 0x1f9d57);
  g.generateTexture("ghost-ok", DIAMOND_FRAME_W, DIAMOND_FRAME_H);
  g.clear();
  drawDiamond(g, GHOST_POINTS, 0xff5a5a, 0.5, 0xb0231e);
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
  drawDiamond(g, PLACEHOLDER_POINTS, 0x9aa4b2, 0.9, 0x4b5563);
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
  }

  create(): void {
    makeGhostTextures(this);
    makePlaceholderTexture(this);
    validateAtlasFrames(this);
    this.scene.start("MainScene");
  }
}