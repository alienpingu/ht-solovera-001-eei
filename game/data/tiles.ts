import island from "./island.json";

/**
 * Pure game data layer: the baked island layout plus building definitions.
 * This module MUST stay free of Phaser imports — it is shared by the
 * deterministic simulation engine (game/engine/simulation.ts) and the
 * renderer (scenes). Texture keys are opaque strings resolved only by
 * the BootScene, so swapping art never touches logic.
 */

export type GroundKind =
  | "water"
  | "sand"
  | "sand2"
  | "grass"
  | "grass2"
  | "grass3"
  | "dirt";

export const GRID_W = island.width;
export const GRID_H = island.height;

/** Pre-baked ground grid from game/data/island.json (row-major: [row][col]). */
export const ISLAND: GroundKind[][] = island.tiles as GroundKind[][];

/** Pre-baked decorative scatter from game/data/island.json (render-only). */
export const DECOR: { row: number; col: number; frame: string }[] = island.decor as {
  row: number;
  col: number;
  frame: string;
}[];

/**
 * Iso diamond geometry, in pixels.
 * Kenney's ground frames are 132x83 blocks. The visible TOP FACE is a 132x66
 * diamond at frame y=1..67 (top vertex y=1, widest y=34, bottom vertex y=67);
 * y=68..81 is the soil side, hidden by the tile in front. The iso grid uses
 * that 2:1 diamond (132 wide, 66 tall).
 * World position of a cell's diamond bottom-center:
 *   x = (col - row) * HALF_W
 *   y = (col + row) * HALF_H
 */
export const ISO = {
  TILE_W: 132,
  TILE_H: 66,
  HALF_W: 66,
  HALF_H: 33,
} as const;

export function groundAt(row: number, col: number): GroundKind {
  return ISLAND[row][col];
}

/** Only non-water terrain is buildable. */
export function isLand(row: number, col: number): boolean {
  return ISLAND[row][col] !== "water";
}

export type BuildingKind = "extractor" | "house" | "eco";

export interface BuildingDef {
  label: string;
  /** Atlas texture key registered by BootScene ("buildings" | "landscape"). */
  sheet: string;
  /** Frame name inside that atlas (not a Phaser import, just a name). */
  texture: string;
  cost: number;
  /** Fraction of cost refunded on demolish. */
  refundRatio: number;
  /** Money produced per tick. */
  income: number;
  /** Pollution delta per tick (negative cleans the island). */
  pollution: number;
  /** Population delta per tick. */
  popGrowth: number;
  /** Minimum island health required for the population to grow. */
  popNeedHealth: number;
  desc: string;
}

export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = {
  extractor: {
    label: "Extractor",
    sheet: "buildings",
    texture: "buildingTiles_081.png",
    cost: 30,
    refundRatio: 0.5,
    income: 4,
    pollution: 2,
    popGrowth: 0,
    popNeedHealth: 0,
    desc: "+$4/tick, pollution +2",
  },
  house: {
    label: "House",
    sheet: "buildings",
    texture: "buildingTiles_001.png",
    cost: 40,
    refundRatio: 0.5,
    income: 0,
    pollution: 1,
    popGrowth: 1,
    popNeedHealth: 40,
    desc: "+1 pop/tick (needs health ≥ 40)",
  },
  eco: {
    label: "Tree",
    sheet: "landscape",
    texture: "landscapeTiles_005.png",
    cost: 20,
    refundRatio: 0.5,
    income: 0,
    pollution: -2,
    popGrowth: 0,
    popNeedHealth: 0,
    desc: "pollution -2/tick",
  },
};

/** UI order for the build menu. */
export const BUILDING_ORDER: BuildingKind[] = ["extractor", "house", "eco"];

/**
 * Ground kind -> tile index in the baked uniform tileset
 * (public/assets/tiles/ground-sheet.png). The sheet order is produced by
 * scripts/build-kenney-sheets.mjs — keep the two in lockstep.
 */
export const GROUND_SHEET_INDEX: Record<GroundKind, number> = {
  water: 0,
  sand: 1,
  sand2: 2,
  grass: 3,
  grass2: 4,
  grass3: 5,
  dirt: 6,
};