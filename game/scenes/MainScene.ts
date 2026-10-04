import Phaser from "phaser";
import {
  ISO,
  GRID_W,
  GRID_H,
  ISLAND,
  TILE_FRAME,
  GROUND_ORIGIN_Y,
  BUILDING_DEFS,
  BUILDING_ORDER,
  isLand,
} from "@/game/data/tiles";
import type { BuildingKind } from "@/game/data/tiles";
import {
  createInitialState,
  tick,
  placeBuilding,
  removeBuilding,
  canBuild,
  canAfford,
  TICK_MS,
} from "@/game/engine/simulation";
import type { SimState } from "@/game/engine/simulation";
import { projectObj } from "@/game/engine/isoMesh";
import type { ParsedObjData } from "@/game/engine/isoMesh";
import { MODEL_OBJ_KEY, MODEL_TEX_KEY } from "@/game/scenes/BootScene";
import { bus } from "@/game/events/bus";

const CELL_KEY = (row: number, col: number): string => `${row}:${col}`;

// The config seeds the canvas at 900×640 until the parent is measured (see
// game/config.ts). Comparing against that seed tells a pre-measure fit from a
// real one. We deliberately don't import GAME_WIDTH/HEIGHT here: config.ts
// imports this scene, so a scene->config import would be a circular ESM
// dependency whose consts aren't initialized yet.
const SEED_W = 900;
const SEED_H = 640;

// Portrait camera default. The whole-island fit is width-constrained (the
// island diamond is ~2:1), so on a tall phone the island shrinks to a thin
// ~23%-height band with empty water above/below. Instead we zoom into the
// island centre: fill this share of the viewport height while keeping at
// least this share of the island's width on screen (the rest via pan/pinch).
const PORTRAIT_FILL_H = 0.6;
const PORTRAIT_MIN_WIDTH_VISIBLE = 0.5;

/** Ghost tints: green = buildable + affordable, amber = affordable-locked, red = blocked. */
const GHOST_OK = 0x3ddc84;
const GHOST_BAD = 0xff5a5a;
const GHOST_UNFUNDED = 0xf59e0b;

/**
 * The island starts seeded with a random wild forest (the player's only
 * starting resource — cut trees for cash). Range tuned so there is enough wood
 * to bootstrap factories + power without the forest trivializing pollution.
 */
const MIN_TREES = 24;
const MAX_TREES = 38;
/** Rejection-sampling cap; a tiny island can't loop forever, it just spawns fewer. */
const SCATTER_ATTEMPTS = 500;

/** Axis-aligned world-space box used to hit-test buildings by their visual extent. */
interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Bookkeeping for a placed building's clickable box (anchor + depth for front-most picking). */
interface BuildingHit {
  row: number;
  col: number;
  kind: BuildingKind;
  depth: number;
  aabb: WorldBounds;
}

/**
 * MainScene: renders the iso island, owns the authoritative SimState, and
 * turns taps/drags into building/demolish actions forwarded to the pure
 * engine.
 *
 * The ground is one atlas sprite per cell (no tilemap, no baked sheet, no
 * separate decoration list): every cell is drawn the same way and depth-sorted
 * by (row+col) so the tile in front covers the soil side of the tile behind.
 * Buildings are sprites on the same container, one depth step above the ground
 * on their cell.
 *
 * The container stays at scale 1 and the CAMERA does all the fitting/zooming,
 * which is what lets portrait phones go edge-to-edge and lets two-finger
 * gestures pan/zoom without touching the iso math.
 */
export class MainScene extends Phaser.Scene {
  private iso!: Phaser.GameObjects.Container;
  private state!: SimState;

  /** Buildings placed on the grid, keyed by `${row}:${col}` (anchor cell). */
  private buildingSprites = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Mesh>();

  /** Clickable world-space boxes for the same buildings, so a tap on a tall
   *  building's body resolves to IT rather than the empty ground cell behind it. */
  private buildingHits = new Map<string, BuildingHit>();

  /** Translucent buildable/water overlay, drawn only while placing. */
  private gridGraphics!: Phaser.GameObjects.Graphics;

  /**
   * Ghost = the selected building (textured 3D mesh when the model loaded, else
   * the atlas sprite) tinted by validity + a diamond outline. `ghostKind`
   * tracks which model the ghost mesh was built from so it is only rebuilt on
   * kind change (rebuilding clears all faces, which is wasteful per frame).
   */
  private ghost!: Phaser.GameObjects.Image;
  private ghostMesh: Phaser.GameObjects.Mesh | null = null;
  private ghostKind: BuildingKind | null = null;
  private ghostOutline!: Phaser.GameObjects.Image;
  private hovered: { row: number; col: number } | null = null;
  private selectedKind: BuildingKind | null = null;

  // Tap-vs-drag: a sloppy touch move shouldn't commit a demolish. In build
  // mode we intentionally allow drag-to-place, so the threshold only guards
  // demolish taps. `downId` keeps us honest under multi-touch. Screen-space
  // (`downScreen`) is deliberate: panning changes world coords mid-drag.
  private downScreen = new Phaser.Math.Vector2();
  private downId = -1;
  private downButton: "left" | "right" | "middle" = "left";

  // Desktop pan. Left-drag pans when nothing is selected (otherwise it places);
  // middle/right-drag pans in any mode. `panCapable` arms the gesture on
  // pointerdown, `panning` latches once the 6px threshold is crossed.
  private panLast = new Phaser.Math.Vector2();
  private panCapable = false;
  private panning = false;

  // Two-finger gestures. Screen-space (p.x/p.y) is deliberate: using world
  // coords would feed the camera's own scroll back into the pan and drift.
  private activePointers = new Map<number, { x: number; y: number }>();
  private gestureActive = false;
  private lastPinchDist = 0;
  private lastMid = new Phaser.Math.Vector2();

  private hasFitted = false;

  // Island extents in world units, recomputed on fit. Kept as fields so the
  // pan/zoom gesture can clamp against them without touching camera.setBounds
  // (Phaser's bounds clamp pins a zoomed-out view to the bounds' top-left
  // instead of centering it, which pushed the island off the tap area).
  private boundsMinX = 0;
  private boundsMaxX = 0;
  private boundsMinY = 0;
  private boundsMaxY = 0;

  /**
   * World-space frame of the playable LANDMASS (grass), not the whole grid.
   * The camera fits/centers on this so the island fills the screen instead of
   * shrinking inside the 30x30 grid's bounding box (which also includes the
   * water ring and the diamond's empty corners). Computed once and reused.
   */
  private landBounds: WorldBounds | null = null;

  private tickTimer?: Phaser.Time.TimerEvent;
  private unsubs: (() => void)[] = [];

  constructor() {
    super("MainScene");
  }

  create(): void {
    // Seed the island with a random wild forest. The RNG lives here (Phaser
    // side); the pure engine just places the handed cells as free trees.
    const seedTrees = this.scatterTrees();
    this.state = createInitialState(seedTrees);
    this.iso = this.add.container(0, 0);

    // Build overlay sits under every tile (tiles are depth >= 1).
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.setDepth(0);
    this.iso.add(this.gridGraphics);

    this.renderTiles();
    for (const t of seedTrees) this.addBuildingSprite(t.row, t.col, "eco");

    // Ghost building sprite + the diamond outline that nests with the ground.
    // The outline is drawn in the ground frame's own space (diamond at frame
    // y=1..67 of an 83px frame), so it is anchored top-left, not bottom-center.
    this.ghostOutline = new Phaser.GameObjects.Image(this, 0, 0, "ghost-ok");
    this.ghostOutline.setOrigin(0, 0).setDepth(999).setVisible(false);
    this.ghost = new Phaser.GameObjects.Image(this, 0, 0, "placeholder");
    this.ghost.setOrigin(0.5, 1).setDepth(1000).setVisible(false);
    this.iso.add(this.ghostOutline);
    this.iso.add(this.ghost);

    // A second extra pointer so two-finger pinch/pan always has input slots.
    this.input.addPointer(1);

    // Register the resize listener before the initial fit so a parent
    // measurement landing during/just after create() is never missed.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.fitCamera();
    this.wireInput();
    this.wireBus();
    // The tick timer is NOT created here: the run stays paused (Day 0) until
    // React emits sim:start from the welcome dialog. A remounted MainScene
    // (StrictMode/HMR) re-boots paused, and sim:boot lets React resume it.
    bus.emit("sim:boot");

    // Push the initial state so the HUD is correct on first paint.
    bus.emit("sim:update", this.state);
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  /**
   * Pick a random set of land cells for the starting forest. Rejection samples
   * unique grass cells (trees are 1x1), so there is no overlap and no water.
   * Called on a fresh grid, so occupancy is implicit — the Set is the only
   * dedupe. Randomness is deliberately Phaser-side: the sim engine has none.
   */
  private scatterTrees(): { row: number; col: number }[] {
    const count = Phaser.Math.Between(MIN_TREES, MAX_TREES);
    const trees: { row: number; col: number }[] = [];
    const used = new Set<string>();
    for (let attempt = 0; attempt < SCATTER_ATTEMPTS && trees.length < count; attempt++) {
      const row = Phaser.Math.Between(0, GRID_H - 1);
      const col = Phaser.Math.Between(0, GRID_W - 1);
      if (used.has(CELL_KEY(row, col)) || !isLand(row, col)) continue;
      used.add(CELL_KEY(row, col));
      trees.push({ row, col });
    }
    return trees;
  }

  /**
   * Draw the ground as one atlas sprite per cell. There is no tilemap and no
   * baked sheet: ground and what used to be "decoration" are the same kind of
   * object, so they share one code path. Sprites live on the iso container and
   * are depth-sorted by (row+col) so the tile in front covers the soil side of
   * the tile behind.
   */
  private renderTiles(): void {
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        const img = this.makeSprite("landscape", TILE_FRAME[ISLAND[r][c]]);
        // Anchor the visible top face (frame y=67 of the 83px frame) to the
        // cell diamond, not the frame's soil bottom.
        img.setOrigin(0.5, GROUND_ORIGIN_Y);
        const pos = MainScene.isoToWorld(c, r);
        img.setPosition(pos.x, pos.y);
        img.setDepth((r + c) * 2 + 1);
        this.iso.add(img);
      }
    }
    this.sortIso();
  }

  /**
   * Make a sprite for an atlas frame, falling back to the baked placeholder if
   * the atlas/frame is missing. Passing the frame as the TEXTURE key was the
   * old bug that rendered Phaser's green-cross `__MISSING` over every object.
   */
  private makeSprite(sheet: string, frame: string): Phaser.GameObjects.Image {
    const texture = this.textures.get(sheet);
    if (texture && texture.has(frame)) {
      return new Phaser.GameObjects.Image(this, 0, 0, sheet, frame);
    }
    return new Phaser.GameObjects.Image(this, 0, 0, "placeholder");
  }

  /**
   * Depth of a building on the iso stack. A footprint spans several cells, so
   * it sorts by its FRONT-MOST cell (largest row+col): tiles strictly in front
   * (higher row+col) draw over the building's base, and the building draws over
   * its own footprint tiles and everything behind it.
   */
  private static buildingDepth(row: number, col: number, kind: BuildingKind): number {
    const def = BUILDING_DEFS[kind];
    const rowFront = Math.floor(def.footH / 2);
    const colFront = Math.floor(def.footW / 2);
    return (row + rowFront + col + colFront) * 2 + 2;
  }

  private modelReady(kind: BuildingKind): boolean {
    return this.cache.obj.has(MODEL_OBJ_KEY(kind)) && this.textures.exists(MODEL_TEX_KEY(kind));
  }

  /**
   * Build a textured 3D mesh for a building kind. The OBJ vertices are
   * pre-projected into the iso grid plane by projectObj() (pure), then fed to
   * addVertices as flat xyz triplets. The mesh must be added to the iso
   * container afterwards (that registration also puts it on the update list so
   * preUpdate computes its vertex transforms).
   */
  private buildBuildingMesh(kind: BuildingKind): Phaser.GameObjects.Mesh {
    const def = BUILDING_DEFS[kind];
    const mesh = new Phaser.GameObjects.Mesh(this, 0, 0, MODEL_TEX_KEY(kind));
    const data = this.cache.obj.get(MODEL_OBJ_KEY(kind)) as unknown as ParsedObjData;
    const { verts, uvs } = projectObj(data, def.model);
    // Stash the projected 2D extent (relative to the mesh origin) so the click
    // hit-test has the building's visual box. The mesh transform renders Y
    // negated (see isoMesh), so the world box is mirrored on that axis.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i];
      const y = -verts[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    (mesh as Phaser.GameObjects.Mesh & { isoBounds: WorldBounds }).isoBounds = { minX, maxX, minY, maxY };
    // projectObj's Y negation reflects face winding, so the default CCW
    // culling would throw away the visible faces. Render all faces and let the
    // per-face painter depth (Z in projectObj) sort them.
    mesh.hideCCW = false;
    mesh.addVertices(verts, uvs, undefined, true);
    this.applyMeshProjection(mesh);
    return mesh;
  }

  /**
   * Keep the mesh's projection 1:1 (one projected unit = one world pixel).
   * transformCoordinatesLocal maps NDC -> pixels using the mesh's OWN
   * width/height, and the projection maps unit->NDC via setOrtho's scale, so
   * both must track the current canvas size (they differ after a RESIZE).
   */
  private applyMeshProjection(mesh: Phaser.GameObjects.Mesh): void {
    const renderer = this.sys.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    mesh.setSize(renderer.width, renderer.height);
    mesh.setOrtho(renderer.width, renderer.height);
  }

  private addBuildingSprite(row: number, col: number, kind: BuildingKind): void {
    const def = BUILDING_DEFS[kind];
    const pos = MainScene.isoToWorld(col, row);
    let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Mesh;
    if (this.modelReady(kind)) {
      obj = this.buildBuildingMesh(kind);
    } else {
      obj = this.makeSprite(def.sheet, def.texture);
      obj.setOrigin(0.5, 1);
    }
    this.iso.add(obj);
    // Meshes anchor at the cell's bottom vertex; raise them so the base sits on
    // the grass. Sprites are already bottom-anchored at that vertex.
    obj.setPosition(pos.x, obj instanceof Phaser.GameObjects.Mesh ? pos.y - def.model.raisePx : pos.y);
    const depth = MainScene.buildingDepth(row, col, kind);
    obj.setDepth(depth);
    this.buildingSprites.set(CELL_KEY(row, col), obj);
    this.buildingHits.set(CELL_KEY(row, col), {
      row,
      col,
      kind,
      depth,
      aabb: this.buildingWorldBounds(obj, pos, def.model.raisePx),
    });
    this.sortIso();
  }

  /** World-space clickable box of a placed building. Mesh bounds come from the
   *  projected verts (stored on the mesh) shifted by its position; sprite
   *  fallbacks use the frame's own bounds. */
  private buildingWorldBounds(
    obj: Phaser.GameObjects.Image | Phaser.GameObjects.Mesh,
    pos: Phaser.Math.Vector2,
    raisePx: number,
  ): WorldBounds {
    if (obj instanceof Phaser.GameObjects.Mesh) {
      const b = (obj as Phaser.GameObjects.Mesh & { isoBounds?: WorldBounds }).isoBounds ?? {
        minX: -ISO.HALF_W,
        maxX: ISO.HALF_W,
        minY: -ISO.TILE_H,
        maxY: 0,
      };
      return {
        minX: pos.x + b.minX,
        maxX: pos.x + b.maxX,
        minY: pos.y - raisePx + b.minY,
        maxY: pos.y - raisePx + b.maxY,
      };
    }
    const g = obj.getBounds();
    return { minX: g.x, maxX: g.x + g.width, minY: g.y, maxY: g.y + g.height };
  }

  /**
   * Container children render in insertion order — per-child `depth` is not
   * applied automatically — so sort explicitly to keep iso front/back
   * overlap correct as tiles/buildings are added.
   */
  private sortIso(): void {
    this.iso.sort("depth");
  }

  private removeBuildingSprite(row: number, col: number): void {
    const img = this.buildingSprites.get(CELL_KEY(row, col));
    if (img) {
      img.destroy();
      this.buildingSprites.delete(CELL_KEY(row, col));
      this.buildingHits.delete(CELL_KEY(row, col));
    }
  }

  /**
   * Draw the buildable-area overlay: green diamonds on free land, amber on
   * occupied land, red on water, plus a faint grid. Redrawn only on selection
   * / state changes (never per frame), so 100 cells is free.
   */
  private drawBuildGrid(): void {
    const g = this.gridGraphics;
    g.clear();
    if (!this.selectedKind) return;

    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        const p = MainScene.isoToWorld(c, r);
        const occupied = this.state.grid[r][c] !== null;
        let fill = 0xff5a5a; // water / blocked
        if (isLand(r, c)) fill = occupied ? 0xf5a524 : 0x3ddc84;
        g.fillStyle(fill, 0.16);
        g.beginPath();
        g.moveTo(p.x, p.y - ISO.TILE_H);
        g.lineTo(p.x + ISO.HALF_W, p.y - ISO.HALF_H);
        g.lineTo(p.x, p.y);
        g.lineTo(p.x - ISO.HALF_W, p.y - ISO.HALF_H);
        g.closePath();
        g.fillPath();
        g.lineStyle(1, 0xffffff, 0.12);
        g.strokePath();
      }
    }
  }

  /**
   * Scan the grid's grass cells and return their world-space frame. The top
   * face of the top row plus headroom for tall trees/buildings extends minY;
   * half a tile out on each side gives the coastline breathing room.
   */
  private computeLandBounds(): WorldBounds {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        if (!isLand(r, c)) continue;
        const p = MainScene.isoToWorld(c, r);
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return {
      minX: minX - ISO.HALF_W,
      maxX: maxX + ISO.HALF_W,
      minY: minY - ISO.TILE_H * 2,
      maxY: maxY,
    };
  }

  /**
   * Fit the island with the CAMERA (zoom + manual centering) rather than by
   * scaling the container. Runs on every resize so portrait/landscape both
   * stay edge-to-edge. We deliberately avoid `camera.setBounds`: Phaser's
   * bounds clamp aligns a zoomed-out (view larger than map) camera to the
   * bounds' TOP-LEFT rather than centering it, which on a tall portrait phone
   * parked the island at the top of the screen and made centre taps miss.
   */
  private fitCamera(): void {
    const cam = this.cameras.main;
    const bounds = (this.landBounds ??= this.computeLandBounds());
    this.boundsMinX = bounds.minX;
    this.boundsMaxX = bounds.maxX;
    this.boundsMinY = bounds.minY;
    this.boundsMaxY = bounds.maxY;
    const mapW = this.boundsMaxX - this.boundsMinX;
    const mapH = this.boundsMaxY - this.boundsMinY;

    const vw = this.scale.width;
    const vh = this.scale.height;
    const PAD = 0.94; // breathing room around the island
    let fit = Math.min(vw / mapW, vh / mapH) * PAD;

    // Portrait default framing: zoom into the island centre instead of showing
    // the whole island (which wastes most of the tall viewport). Caps keep at
    // least half the island's width visible so the coasts aren't fully off
    // screen; landscape keeps the whole-island fit.
    if (vw < vh) {
      const zoomIn = Math.min(
        (vh * PORTRAIT_FILL_H) / mapH,
        vw / (mapW * PORTRAIT_MIN_WIDTH_VISIBLE),
      );
      if (zoomIn > fit) fit = zoomIn;
    }

    // First fit sets the default framing; later resizes keep the player's zoom
    // so mobile URL-bar show/hide doesn't fight them. Zoom is otherwise
    // unclamped: the player can zoom in/out without a hard limit. A fit against
    // the seeded 900×640 is NOT final — the parent is measured right after
    // boot, so the first real resize must re-zoom/re-center, else mobile boots
    // framed to a 900×640 view that was never the actual canvas. Once fit to a
    // non-seed size we latch `hasFitted` and only clamp/re-apply mesh
    // projections on later resizes.
    if (!this.hasFitted) {
      cam.setZoom(fit);
      // Center the island with zoom taken into account. `cam.centerOn` ignores
      // zoom (scrollX = x - width/2), which at fit < 1 pushes the view's
      // top-left toward the island centre and shoves the island off-centre.
      const visW = cam.width / cam.zoom;
      const visH = cam.height / cam.zoom;
      cam.scrollX = (this.boundsMinX + this.boundsMaxX) / 2 - visW / 2;
      cam.scrollY = (this.boundsMinY + this.boundsMaxY) / 2 - visH / 2;
      if (vw !== SEED_W || vh !== SEED_H) this.hasFitted = true;
    }
    this.clampCamera();
    // Mesh projection maps vertex units 1:1 to world pixels by scaling against
    // half the canvas size, so a RESIZE changes that ratio for every mesh.
    this.buildingSprites.forEach((obj) => {
      if (obj instanceof Phaser.GameObjects.Mesh) this.applyMeshProjection(obj);
    });
    if (this.ghostMesh) this.applyMeshProjection(this.ghostMesh);
    this.drawBuildGrid();
  }

  /**
   * Keep the island reachable while allowing free scrolling. The camera may
   * travel up to half a view past each map edge, so the island can slide until
   * any edge sits at the screen's centre — that slack is what lets a player
   * drag cells hiding under the bottom UI bar back into reach on mobile. A
   * clamp that kept the whole map on-screen could never clear an overlay.
   * Clamping `scrollX/Y` directly (not `centerOn`) is exact at any zoom.
   */
  private clampCamera(): void {
    const cam = this.cameras.main;
    const visW = cam.width / cam.zoom;
    const visH = cam.height / cam.zoom;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, this.boundsMinX - visW / 2, this.boundsMaxX - visW / 2);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, this.boundsMinY - visH / 2, this.boundsMaxY - visH / 2);
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------

  private wireInput(): void {
    // Desktop: right-click cancels/deselects, so the browser menu only gets in
    // the way. Suppress it on the canvas (touch is unaffected).
    this.input.mouse?.disableContextMenu();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.activePointers.set(p.id, { x: p.x, y: p.y });
      if (this.activePointers.size >= 2) {
        // Second finger: cancel any pending placement, start a gesture.
        this.gestureActive = true;
        this.downId = -1;
        this.panCapable = false;
        this.panning = false;
        this.setGhostVisible(false);
        this.resetGestureBaseline();
        return;
      }
      this.downId = p.id;
      this.downScreen.set(p.x, p.y);
      this.panLast.set(p.x, p.y);
      this.panning = false;
      this.downButton = p.rightButtonDown() ? "right" : p.middleButtonDown() ? "middle" : "left";

      // Right-click means "cancel" on desktop; middle/right-drag then pans.
      if (this.downButton === "right") bus.emit("build:select", null);
      this.panCapable =
        this.downButton !== "left" || (!this.selectedKind && p.leftButtonDown());

      // Show the ghost immediately under the finger (touch has no hover).
      this.hovered = this.worldToCell(p.worldX, p.worldY);
      this.updateGhost();
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.activePointers.has(p.id)) {
        this.activePointers.set(p.id, { x: p.x, y: p.y });
      }
      if (this.gestureActive && this.activePointers.size >= 2) {
        this.handleGesture();
        return;
      }
      if (this.panCapable && p.isDown && p.id === this.downId) {
        const dx = p.x - this.panLast.x;
        const dy = p.y - this.panLast.y;
        if (!this.panning && Math.hypot(dx, dy) > 6) this.panning = true;
        if (this.panning) {
          const cam = this.cameras.main;
          cam.scrollX -= dx / cam.zoom;
          cam.scrollY -= dy / cam.zoom;
          this.panLast.set(p.x, p.y);
          this.clampCamera();
          return;
        }
      }
      // Mouse hover (or single-finger drag) moves the ghost.
      this.hovered = this.worldToCell(p.worldX, p.worldY);
      this.updateGhost();
    });

    const endPointer = (p: Phaser.Input.Pointer): void => {
      this.activePointers.delete(p.id);
      if (this.activePointers.size < 2) {
        this.gestureActive = false;
        this.resetGestureBaseline();
      }
      if (this.gestureActive || p.id !== this.downId) return;
      this.downId = -1;

      const wasPan = this.panning;
      this.panning = false;
      this.panCapable = false;
      if (wasPan) return;

      if (this.selectedKind) {
        // Drag-to-place: commit wherever the ghost last sat.
        if (this.hovered) this.commitAt(this.hovered.row, this.hovered.col);
      } else if (this.downButton === "left") {
        const dx = p.x - this.downScreen.x;
        const dy = p.y - this.downScreen.y;
        if (Math.hypot(dx, dy) <= 6) this.handleDemolishTap(p.worldX, p.worldY);
      }
    };
    this.input.on("pointerup", endPointer);
    this.input.on("pointerupoutside", endPointer);

    this.wireWheel();
    this.wireKeys();
  }

  /**
   * Desktop zoom: the scroll wheel zooms about the cursor (the world point under
   * the pointer stays put), mirroring the mobile pinch. Unclamped zoom, then the
   * usual island scroll clamp.
   */
  private wireWheel(): void {
    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        _over: Phaser.GameObjects.GameObject[],
        _dx: number,
        deltaY: number,
      ) => {
        const cam = this.cameras.main;
        const before = cam.getWorldPoint(pointer.x, pointer.y);
        const factor = deltaY > 0 ? 0.9 : 1.1;
        cam.setZoom(cam.zoom * factor);
        const after = cam.getWorldPoint(pointer.x, pointer.y);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
        this.clampCamera();
      },
    );
  }

  /** Desktop selection shortcuts: 1..6 pick a building, Esc clears. */
  private wireKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    const pick = (index: number): void => {
      const kind = BUILDING_ORDER[index];
      if (kind) bus.emit("build:select", this.selectedKind === kind ? null : kind);
    };
    keyboard.on("keydown-ONE", () => pick(0));
    keyboard.on("keydown-TWO", () => pick(1));
    keyboard.on("keydown-THREE", () => pick(2));
    keyboard.on("keydown-FOUR", () => pick(3));
    keyboard.on("keydown-FIVE", () => pick(4));
    keyboard.on("keydown-SIX", () => pick(5));
    keyboard.on("keydown-ESC", () => bus.emit("build:select", null));
  }

  private resetGestureBaseline(): void {
    this.lastPinchDist = 0;
  }

  /** Pinch = zoom; two-finger midpoint drag = pan. Both in screen space. */
  private handleGesture(): void {
    const pts = [...this.activePointers.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const cam = this.cameras.main;

    if (this.lastPinchDist > 0) {
      const ratio = dist / this.lastPinchDist;
      cam.zoom *= ratio;
      cam.scrollX -= (midX - this.lastMid.x) / cam.zoom;
      cam.scrollY -= (midY - this.lastMid.y) / cam.zoom;
      this.clampCamera();
    }
    this.lastPinchDist = dist;
    this.lastMid.set(midX, midY);
  }

  /** Convert a world-space point to a grid cell, or null if off the map. */
  private worldToCell(worldX: number, worldY: number): { row: number; col: number } | null {
    // getLocalPoint maps world coords into the iso container's local space,
    // already accounting for the camera transform and container transform.
    const local = this.iso.getLocalPoint(worldX, worldY);
    const a = local.x / ISO.HALF_W;
    const b = local.y / ISO.HALF_H;
    const col = Math.round((a + b) / 2);
    const row = Math.round((b - a) / 2);
    if (row < 0 || row >= GRID_H || col < 0 || col >= GRID_W) return null;

    // Snap check: is the point actually inside THIS cell's diamond and not a
    // neighbouring cell's (rounding can land us on a corner neighbour)?
    const cell = MainScene.isoToWorld(col, row);
    const dx = local.x - cell.x;
    const dy = local.y - cell.y;
    if (Math.abs(dx) / ISO.HALF_W + Math.abs(dy) / ISO.HALF_H > 1) return null;
    return { row, col };
  }

  /**
   * Front-most building whose world box contains the point, or null. Tall
   * objects render ABOVE their footprint (foliage overlaps the cell behind),
   * so ground-cell mapping alone can't resolve "what did I click?" — this box
   * test can. Iterates all placed buildings, keeping the one with the largest
   * depth (closest to the camera).
   */
  private buildingAtWorld(worldX: number, worldY: number): BuildingHit | null {
    let best: BuildingHit | null = null;
    for (const hit of this.buildingHits.values()) {
      if (worldX < hit.aabb.minX || worldX > hit.aabb.maxX) continue;
      if (worldY < hit.aabb.minY || worldY > hit.aabb.maxY) continue;
      if (!best || hit.depth > best.depth) best = hit;
    }
    return best;
  }

  private commitAt(row: number, col: number): void {
    const kind = this.selectedKind;
    if (!kind) return;
    const res = placeBuilding(this.state, row, col, kind);
    if (res.ok) {
      this.state = res.state;
      this.addBuildingSprite(row, col, kind);
      bus.emit("build:placed", { row, col, kind });
      // Deselect after a successful placement so the player doesn't
      // accidentally double-build from a follow-up tap/drag.
      bus.emit("build:select", null);
      bus.emit("sim:update", this.state);
      this.drawBuildGrid();
    } else {
      bus.emit("ui:error", res.reason);
    }
    this.updateGhost();
  }

  private handleDemolishTap(worldX: number, worldY: number): void {
    // Prefer the building actually under the pointer (its visual box) so a tap
    // on a tall tree's foliage resolves to that tree instead of the empty cell
    // behind it; ground-cell mapping is the fallback for empty tiles.
    const hit = this.buildingAtWorld(worldX, worldY);
    const cell = hit ? { row: hit.row, col: hit.col } : this.worldToCell(worldX, worldY);
    if (!cell) return;
    const res = removeBuilding(this.state, cell.row, cell.col);
    if (res.ok) {
      this.state = res.state;
      this.removeBuildingSprite(cell.row, cell.col);
      bus.emit("build:removed", { row: cell.row, col: cell.col });
      bus.emit("sim:update", this.state);
    } else {
      bus.emit("ui:error", res.reason);
    }
    this.updateGhost();
  }

  private setGhostVisible(visible: boolean): void {
    this.ghost.setVisible(visible);
    this.ghostOutline.setVisible(visible);
    if (this.ghostMesh) this.ghostMesh.setVisible(visible);
  }

  /** Rebuild the ghost mesh when the selected kind changes (clear()+re-add is wasteful otherwise). */
  private setGhostMeshFor(kind: BuildingKind | null): void {
    if (this.ghostKind === kind) return;
    this.ghostKind = kind;
    if (this.ghostMesh) {
      this.ghostMesh.destroy();
      this.ghostMesh = null;
    }
    if (kind && this.modelReady(kind)) {
      this.ghostMesh = this.buildBuildingMesh(kind);
      this.ghostMesh.setAlpha(0.6).setDepth(1000);
      this.iso.add(this.ghostMesh);
    }
  }

  private updateGhost(): void {
    const kind = this.selectedKind;
    const cell = this.hovered;
    if (!kind || !cell || this.state.gameOver) {
      this.setGhostVisible(false);
      return;
    }
    const pos = MainScene.isoToWorld(cell.col, cell.row);
    const buildable = canBuild(this.state, cell.row, cell.col, kind).ok;
    const affordable = canAfford(this.state, kind);
    // Three states: green = go, amber = location ok but can't afford it yet
    // (cut more trees), red = actually blocked. Distinguishing the two reds is
    // what stops "I just cut a tree and still can't build" from being a mystery.
    const ghostState = buildable ? (affordable ? "ok" : "unfunded") : "bad";
    const tint = ghostState === "ok" ? GHOST_OK : ghostState === "unfunded" ? GHOST_UNFUNDED : GHOST_BAD;
    const def = BUILDING_DEFS[kind];

    if (this.ghostMesh) {
      this.ghostMesh.setPosition(pos.x, pos.y - def.model.raisePx);
      this.ghostMesh.setTint(tint);
      this.ghostMesh.setVisible(true);
      this.ghost.setVisible(false);
    } else {
      this.ghost.setPosition(pos.x, pos.y);
      if (this.ghost.texture.key !== def.sheet || this.ghost.frame.name !== def.texture) {
        const texture = this.textures.get(def.sheet);
        if (texture && texture.has(def.texture)) {
          this.ghost.setTexture(def.sheet, def.texture);
        } else {
          this.ghost.setTexture("placeholder");
        }
      }
      this.ghost.setTint(tint);
      this.ghost.setAlpha(0.6);
      this.ghost.setVisible(true);
    }

    // Anchor the outline's frame to the anchor cell: the ground top-face top
    // vertex sits at frame y=1, so the frame top-left is (pos.x - HALF_W, pos.y - TILE_H - 1).
    this.ghostOutline.setPosition(pos.x - ISO.HALF_W, pos.y - ISO.TILE_H - 1);
    this.ghostOutline.setTexture(`ghost-${ghostState}`);
    this.ghostOutline.setVisible(true);
  }

  // ------------------------------------------------------------------
  // Bus wiring + simulation loop
  // ------------------------------------------------------------------

  private wireBus(): void {
    this.unsubs.push(
      bus.on("build:select", (kind) => {
        this.selectedKind = kind;
        this.setGhostMeshFor(kind);
        this.drawBuildGrid();
        this.updateGhost();
      }),
      bus.on("sim:restart", () => this.restartRun()),
      bus.on("sim:start", () => this.startRun()),
      // The tutorial freezes the day counter while a dialogue is on screen;
      // pause drops the tick timer, resume recreates it (no-op if running).
      bus.on("sim:pause", () => {
        this.tickTimer?.remove();
        this.tickTimer = undefined;
      }),
      bus.on("sim:resume", () => this.startRun()),
    );
    // Always clean up listeners + timers on scene teardown (HMR/navigation).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      this.tickTimer?.remove();
      this.tickTimer = undefined;
    });
  }

  private createTickTimer(): Phaser.Time.TimerEvent {
    return this.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => this.advance(),
    });
  }

  /** Begin the run: create the tick timer if it isn't already running. */
  private startRun(): void {
    if (!this.tickTimer) this.tickTimer = this.createTickTimer();
  }

  private advance(): void {
    const next = tick(this.state);
    const justDied = next.gameOver && !this.state.gameOver;
    const justWon = next.won && !this.state.won;
    this.state = next;
    if (justDied || justWon) {
      // Freeze the simulation on either ending; the React modal drives restart.
      this.tickTimer?.remove();
      this.tickTimer = undefined;
      this.setGhostVisible(false);
      bus.emit(justWon ? "sim:win" : "sim:gameover", next);
    }
    bus.emit("sim:update", this.state);
  }

  private restartRun(): void {
    this.buildingSprites.forEach((obj) => obj.destroy());
    this.buildingSprites.clear();
    this.buildingHits.clear();
    if (this.ghostMesh) {
      this.ghostMesh.destroy();
      this.ghostMesh = null;
    }
    this.ghostKind = null;
    // A fresh run reshuffles the wild forest.
    const seedTrees = this.scatterTrees();
    this.state = createInitialState(seedTrees);
    for (const t of seedTrees) this.addBuildingSprite(t.row, t.col, "eco");
    this.selectedKind = null;
    bus.emit("build:select", null);
    this.hovered = null;
    this.setGhostVisible(false);
    this.drawBuildGrid();
    if (!this.tickTimer) this.tickTimer = this.createTickTimer();
    bus.emit("sim:update", this.state);
  }

  // ------------------------------------------------------------------
  // Static iso math (shared, pure)
  // ------------------------------------------------------------------

  private static isoToWorld(col: number, row: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      (col - row) * ISO.HALF_W,
      (col + row) * ISO.HALF_H,
    );
  }
}
