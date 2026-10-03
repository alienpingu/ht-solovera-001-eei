import island from "./island.json";

/**
 * Pure game data layer: the island layout plus building definitions.
 * This module MUST stay free of Phaser imports — it is shared by the
 * deterministic simulation engine (game/engine/simulation.ts) and the
 * renderer (scenes). Texture keys are opaque strings resolved only by
 * the BootScene, so swapping art never touches logic.
 *
 * There is no separate "decoration" concept: every cell is just a ground
 * tile, and every tile is drawn the same way (an atlas sprite). A cell's
 * kind only matters for buildability (water vs land).
 */

export type GroundKind = "water" | "grass";

export const GRID_W = island.width;
export const GRID_H = island.height;

/** Island grid from game/data/island.json (row-major: [row][col]). */
export const ISLAND: GroundKind[][] = island.tiles as GroundKind[][];

/** Ground kind -> landscape atlas frame. Swapping art happens only here. */
export const TILE_FRAME: Record<GroundKind, string> = {
  water: "landscapeTiles_066.png",
  grass: "landscapeTiles_067.png",
};

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

/**
 * Ground sprites anchor at the TOP FACE's bottom vertex (frame y=67 of an
 * 83px frame), not the frame bottom — that lands the visible 132x66 diamond
 * exactly on the cell, matching how the old iso tilemap placed it. So origin
 * y = 67/83. Objects (buildings) keep origin (0.5, 1).
 */
export const GROUND_ORIGIN_Y = 67 / 83;

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