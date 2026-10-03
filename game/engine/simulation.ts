import { BUILDING_DEFS, GRID_W, GRID_H, isLand } from "@/game/data/tiles";
import type { BuildingKind } from "@/game/data/tiles";

/**
 * Pure, deterministic simulation engine. No Phaser imports, no I/O, no RNG.
 *
 * State transitions are *functional*: every mutating operation returns a NEW
 * state object and leaves the input untouched. This keeps the engine trivially
 * testable and lets Phaser own a single authoritative SimState instance while
 * the UI can safely snapshot states for display.
 *
 * The one thing that is deliberately NOT here: rendering. The engine only
 * computes numbers and a building grid. Pollution/health/population rules are
 * flat constants applied per tick — a documented future refactor could replace
 * them with a spatial diffusion model without touching this interface.
 */

/**
 * A building footprint is a rectangle of grid cells. Every occupied cell holds
 * the SAME record, whose row/col are the ANCHOR (the cell the player tapped,
 * the footprint center). Storing the anchor on each cell lets tick() count a
 * building exactly once (only at its anchor cell) and lets a demolish tap on
 * any footprint cell resolve the full rectangle to clear.
 */
export interface GridCell {
  kind: BuildingKind;
  row: number;
  col: number;
}

export interface SimState {
  /** Elapsed ticks; the survival score. */
  tick: number;
  money: number;
  population: number;
  /** 0..100. Purely derived from pollution below (health = 100 - pollution). */
  health: number;
  /** 0..100. Pollution drives health loss; at 100 the island dies. */
  pollution: number;
  gameOver: boolean;
  /** True once the settlement has survived TARGET_DAYS ticks. */
  won: boolean;
  /** Building grid, row-major. null = empty cell. */
  grid: (GridCell | null)[][];
}

export const START_MONEY = 50;
export const MAX_POLLUTION = 100;
/** Ticks to survive to win the run (the mission goal). */
export const TARGET_DAYS = 365;
/** Real-time ms between simulation ticks (the game's "second"). */
export const TICK_MS = 1000;

export type ActionResult =
  | { ok: true; state: SimState }
  | { ok: false; reason: string };

export function createInitialState(): SimState {
  return {
    tick: 0,
    money: START_MONEY,
    population: 0,
    health: MAX_POLLUTION,
    pollution: 0,
    gameOver: false,
    won: false,
    grid: Array.from({ length: GRID_H }, () =>
      Array<GridCell | null>(GRID_W).fill(null),
    ),
  };
}

/** Shallow clone of state with a copied grid — the grid is tiny (<=900 cells). */
function clone(state: SimState): SimState {
  return { ...state, grid: state.grid.map((row) => row.slice()) };
}

/**
 * Cells covered by a building anchored at (row, col). The anchor is the
 * footprint CENTER: it extends rowBack..rowFront rows up/down and
 * colBack..colFront columns left/right, so a 4x2 house centered on a cell
 * covers 2 columns to its right and 1 to its left. The front-most cell (max
 * row+col) is what the renderer depth-sorts against.
 */
export function footprintCells(
  row: number,
  col: number,
  kind: BuildingKind,
): { row: number; col: number; rowFront: number; colFront: number }[] {
  const def = BUILDING_DEFS[kind];
  const rowBack = Math.floor((def.footH - 1) / 2);
  const rowFront = Math.floor(def.footH / 2);
  const colBack = Math.floor((def.footW - 1) / 2);
  const colFront = Math.floor(def.footW / 2);
  const cells: { row: number; col: number; rowFront: number; colFront: number }[] = [];
  for (let r = row - rowBack; r <= row + rowFront; r++) {
    for (let c = col - colBack; c <= col + colFront; c++) {
      cells.push({ row: r, col: c, rowFront, colFront });
    }
  }
  return cells;
}

export function cellKind(state: SimState, row: number, col: number): BuildingKind | null {
  return state.grid[row][col]?.kind ?? null;
}

export function canAfford(state: SimState, kind: BuildingKind): boolean {
  return state.money >= BUILDING_DEFS[kind].cost;
}

/**
 * Validate that a building of `kind` may be placed with its anchor on
 * (row, col). Location checks only; affordability is the caller's concern
 * (kept separate so the UI can grey out buttons instead of failing taps).
 */
export function canBuild(
  state: SimState,
  row: number,
  col: number,
  kind: BuildingKind,
): ActionResult {
  if (state.gameOver) return { ok: false, reason: "The island has fallen" };
  if (state.won) return { ok: false, reason: "The settlement has been secured" };
  for (const cell of footprintCells(row, col, kind)) {
    if (cell.row < 0 || cell.row >= GRID_H || cell.col < 0 || cell.col >= GRID_W) {
      return { ok: false, reason: "Building would hang off the island" };
    }
    if (!isLand(cell.row, cell.col)) return { ok: false, reason: "Can't build on water" };
    if (state.grid[cell.row][cell.col]) return { ok: false, reason: "Tile already occupied" };
  }
  return { ok: true, state };
}

export function placeBuilding(
  state: SimState,
  row: number,
  col: number,
  kind: BuildingKind,
): ActionResult {
  const spot = canBuild(state, row, col, kind);
  if (!spot.ok) return spot;
  const def = BUILDING_DEFS[kind];
  if (state.money < def.cost) return { ok: false, reason: `Need $${def.cost}` };

  const next = clone(state);
  for (const cell of footprintCells(row, col, kind)) {
    next.grid[cell.row][cell.col] = { kind, row, col };
  }
  next.money -= def.cost;
  return { ok: true, state: next };
}

export function removeBuilding(state: SimState, row: number, col: number): ActionResult {
  const cell = state.grid[row][col];
  if (!cell) return { ok: false, reason: "Nothing to demolish here" };

  const next = clone(state);
  for (const fc of footprintCells(cell.row, cell.col, cell.kind)) {
    next.grid[fc.row][fc.col] = null;
  }
  next.money += Math.floor(BUILDING_DEFS[cell.kind].cost * BUILDING_DEFS[cell.kind].refundRatio);
  return { ok: true, state: next };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Advance the simulation one tick. Pure: returns a new state, never mutates
 * the argument. Order matters and is deliberate:
 *   1. sum income + pollution from every building on the grid (each building
 *      counted ONCE, at its anchor cell — a multi-tile footprint shares one
 *      anchor record, so without the anchor guard a 4x3 factory would bill
 *      12x its income/pollution)
 *   2. apply money, clamp pollution to [0,100]
 *   3. health is a derived quantity (100 - pollution)
 *   4. population grows only while the island is healthy enough
 *   5. pollution == 100 kills the island (game over)
 *   6. surviving TARGET_DAYS ticks wins the run (win takes precedence over a
 *      death only because the two checks are mutually exclusive by tick count)
 */
export function tick(state: SimState): SimState {
  if (state.gameOver || state.won) return state;

  let income = 0;
  let pollution = 0;
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const cell = state.grid[r][c];
      if (!cell || cell.row !== r || cell.col !== c) continue;
      income += BUILDING_DEFS[cell.kind].income;
      pollution += BUILDING_DEFS[cell.kind].pollution;
    }
  }

  const next = clone(state);
  next.tick += 1;
  next.money += income;
  next.pollution = clamp(next.pollution + pollution, 0, MAX_POLLUTION);
  next.health = MAX_POLLUTION - next.pollution;

  // Population churn: people flee an unhealthy island.
  let popDelta = 0;
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const cell = next.grid[r][c];
      if (!cell || cell.kind !== "house" || cell.row !== r || cell.col !== c) continue;
      const def = BUILDING_DEFS.house;
      popDelta += next.health >= def.popNeedHealth ? def.popGrowth : -def.popGrowth;
    }
  }
  next.population = clamp(next.population + popDelta, 0, Number.MAX_SAFE_INTEGER);

  if (next.pollution >= MAX_POLLUTION) {
    next.health = 0;
    next.gameOver = true;
  } else if (next.tick >= TARGET_DAYS) {
    next.won = true;
  }
  return next;
}