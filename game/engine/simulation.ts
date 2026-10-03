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
  /** Building grid, row-major. null = empty cell. */
  grid: (BuildingKind | null)[][];
}

export const START_MONEY = 50;
export const MAX_POLLUTION = 100;
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
    grid: Array.from({ length: GRID_H }, () =>
      Array<BuildingKind | null>(GRID_W).fill(null),
    ),
  };
}

/** Shallow clone of state with a copied grid — the grid is tiny (<=144 cells). */
function clone(state: SimState): SimState {
  return { ...state, grid: state.grid.map((row) => row.slice()) };
}

export function cellKind(state: SimState, row: number, col: number): BuildingKind | null {
  return state.grid[row][col];
}

export function canAfford(state: SimState, kind: BuildingKind): boolean {
  return state.money >= BUILDING_DEFS[kind].cost;
}

/**
 * Validate that a cell may host a new building. Location checks only;
 * affordability is the caller's concern (kept separate so the UI can grey
 * out buttons instead of failing taps).
 */
export function canBuild(state: SimState, row: number, col: number): ActionResult {
  if (row < 0 || row >= GRID_H || col < 0 || col >= GRID_W) {
    return { ok: false, reason: "Off the island" };
  }
  if (!isLand(row, col)) return { ok: false, reason: "Can't build on water" };
  if (state.grid[row][col]) return { ok: false, reason: "Tile already occupied" };
  if (state.gameOver) return { ok: false, reason: "The island has fallen" };
  return { ok: true, state };
}

export function placeBuilding(
  state: SimState,
  row: number,
  col: number,
  kind: BuildingKind,
): ActionResult {
  const spot = canBuild(state, row, col);
  if (!spot.ok) return spot;
  const def = BUILDING_DEFS[kind];
  if (state.money < def.cost) return { ok: false, reason: `Need $${def.cost}` };

  const next = clone(state);
  next.grid[row][col] = kind;
  next.money -= def.cost;
  return { ok: true, state: next };
}

export function removeBuilding(state: SimState, row: number, col: number): ActionResult {
  const kind = state.grid[row][col];
  if (!kind) return { ok: false, reason: "Nothing to demolish here" };

  const next = clone(state);
  next.grid[row][col] = null;
  next.money += Math.floor(BUILDING_DEFS[kind].cost * BUILDING_DEFS[kind].refundRatio);
  return { ok: true, state: next };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Advance the simulation one tick. Pure: returns a new state, never mutates
 * the argument. Order matters and is deliberate:
 *   1. sum income + pollution from every building on the grid
 *   2. apply money, clamp pollution to [0,100]
 *   3. health is a derived quantity (100 - pollution)
 *   4. population grows only while the island is healthy enough
 *   5. pollution == 100 kills the island (game over)
 */
export function tick(state: SimState): SimState {
  if (state.gameOver) return state;

  let income = 0;
  let pollution = 0;
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const kind = state.grid[r][c];
      if (!kind) continue;
      income += BUILDING_DEFS[kind].income;
      pollution += BUILDING_DEFS[kind].pollution;
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
      const kind = next.grid[r][c];
      if (kind !== "house") continue;
      const def = BUILDING_DEFS.house;
      popDelta += next.health >= def.popNeedHealth ? def.popGrowth : -def.popGrowth;
    }
  }
  next.population = clamp(next.population + popDelta, 0, Number.MAX_SAFE_INTEGER);

  if (next.pollution >= MAX_POLLUTION) {
    next.health = 0;
    next.gameOver = true;
  }
  return next;
}