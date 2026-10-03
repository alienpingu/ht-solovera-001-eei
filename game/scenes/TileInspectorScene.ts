import Phaser from "phaser";
import { ISO } from "@/game/data/tiles";
import { inspectorEvents } from "@/game/test/inspectorEvents";
import type { TilePick } from "@/game/test/inspectorEvents";

/**
 * /test tile inspector. Loads the raw Kenney TexturePacker atlases and lays
 * EVERY frame on an iso diamond grid so frames can be eyeballed and picked by
 * id. This is a debug tool, not game code: it never imports the engine, the
 * bus, or BootScene, and it is not part of GAME_CONFIG.
 *
 * Every frame is spawned as an Image (origin bottom-center, same anchoring the
 * game uses for objects). Clicks are captured by an invisible per-cell Zone
 * with a diamond polygon hit area, so a tap always resolves to the cell even
 * when a tall frame's transparent pixels overlap the tile in front.
 */

const SHEETS = ["landscape", "buildings"] as const;
const COLS = 16;

const GROUND_DARK = 0x1e293b;
const GROUND_LIGHT = 0x273449;
const GROUND_EDGE = 0x475569;

export class TileInspectorScene extends Phaser.Scene {
  private total = 0;
  private fitZoom = 1;

  constructor() {
    super("TileInspectorScene");
  }

  preload(): void {
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
    // Enumerate every frame at runtime from the loaded atlases (names are
    // zero-padded, so a lexical sort matches numeric order).
    const tiles: { sheet: string; frame: string }[] = [];
    for (const sheet of SHEETS) {
      const names = this.textures.get(sheet).getFrameNames().slice().sort();
      for (const frame of names) tiles.push({ sheet, frame });
    }
    this.total = tiles.length;
    const rows = Math.ceil(this.total / COLS);

    this.drawGround(rows);
    this.placeTiles(tiles);
    this.fitCamera(rows);
    this.wirePanZoom();

    const onResize = (): void => this.fitCamera(rows);
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize, this);
    });
  }

  /** Neutral checkerboard diamonds so the grid reads as a floor under the art. */
  private drawGround(rows: number): void {
    const g = this.add.graphics().setDepth(0);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < COLS; col++) {
        const { x, y } = TileInspectorScene.isoToWorld(col, row);
        g.fillStyle((row + col) % 2 === 0 ? GROUND_DARK : GROUND_LIGHT, 1);
        g.beginPath();
        g.moveTo(x, y - ISO.TILE_H);
        g.lineTo(x + ISO.HALF_W, y - ISO.HALF_H);
        g.lineTo(x, y);
        g.lineTo(x - ISO.HALF_W, y - ISO.HALF_H);
        g.closePath();
        g.fillPath();
        g.lineStyle(1, GROUND_EDGE, 0.6);
        g.strokePath();
      }
    }
  }

  private placeTiles(tiles: { sheet: string; frame: string }[]): void {
    tiles.forEach((tile, index) => {
      const row = Math.floor(index / COLS);
      const col = index % COLS;
      const { x, y } = TileInspectorScene.isoToWorld(col, row);

      this.add
        .image(x, y, tile.sheet, tile.frame)
        .setOrigin(0.5, 1)
        .setDepth((row + col) * 2 + 1);

      // Hit target: the 132x66 cell diamond, anchored top-left at the cell's
      // bounding-box corner (origin 0 keeps local coords origin-independent).
      const zone = this.add
        .zone(x - ISO.HALF_W, y - ISO.TILE_H, ISO.TILE_W, ISO.TILE_H)
        .setOrigin(0, 0)
        .setDepth(100000);
      zone.setInteractive(
        new Phaser.Geom.Polygon([
          ISO.HALF_W,
          0,
          ISO.TILE_W,
          ISO.HALF_H,
          ISO.HALF_W,
          ISO.TILE_H,
          0,
          ISO.HALF_H,
        ]),
        Phaser.Geom.Polygon.Contains,
      );

      const pick: TilePick = { sheet: tile.sheet, frame: tile.frame, row, col, index, total: this.total };
      zone.on("pointerdown", () => this.pick(pick));
    });
  }

  private pick(tile: TilePick): void {
    console.log(`[tile] ${tile.sheet} / ${tile.frame} cell=(${tile.row},${tile.col}) index=${tile.index}/${tile.total}`);
    inspectorEvents.emitTile(tile);
  }

  private fitCamera(rows: number): void {
    const cam = this.cameras.main;
    const minX = -(rows - 1) * ISO.HALF_W - ISO.HALF_W;
    const maxX = (COLS - 1) * ISO.HALF_W + ISO.HALF_W;
    const minY = -ISO.TILE_H * 2; // headroom for tall frames above row 0
    const maxY = (COLS - 1 + rows - 1) * ISO.HALF_H + ISO.TILE_H;
    const fit = Math.min(this.scale.width / (maxX - minX), this.scale.height / (maxY - minY)) * 0.92;
    this.fitZoom = fit;
    cam.setZoom(fit);
    cam.centerOn((minX + maxX) / 2, (minY + maxY) / 2);
  }

  /** Wheel = zoom at pointer; single-finger/mouse drag = pan. */
  private wirePanZoom(): void {
    const cam = this.cameras.main;

    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        _currentlyOver: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => {
        const before = cam.getWorldPoint(pointer.x, pointer.y);
        const factor = deltaY > 0 ? 0.9 : 1.1;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, this.fitZoom * 0.4, this.fitZoom * 6));
        const after = cam.getWorldPoint(pointer.x, pointer.y);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
      },
    );

    let panning = false;
    let lastX = 0;
    let lastY = 0;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      panning = true;
      lastX = p.x;
      lastY = p.y;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!panning || !p.isDown) return;
      cam.scrollX -= (p.x - lastX) / cam.zoom;
      cam.scrollY -= (p.y - lastY) / cam.zoom;
      lastX = p.x;
      lastY = p.y;
    });
    const stop = (): void => {
      panning = false;
    };
    this.input.on("pointerup", stop);
    this.input.on("pointerupoutside", stop);
  }

  private static isoToWorld(col: number, row: number): { x: number; y: number } {
    return { x: (col - row) * ISO.HALF_W, y: (col + row) * ISO.HALF_H };
  }
}
