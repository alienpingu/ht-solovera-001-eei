// Deterministic smoke test for the simulation engine.
// Run: npx tsx scripts/sim-test.ts
import {
  createInitialState,
  placeBuilding,
  removeBuilding,
  tick,
  canBuild,
  footprintCells,
  TARGET_DAYS,
} from "../game/engine/simulation";
import type { SimState } from "../game/engine/simulation";
import { BUILDING_DEFS, isLand, GRID_W, GRID_H, ISLAND } from "../game/data/tiles";
import type { BuildingKind } from "../game/data/tiles";

// The island shape is generated, so land cells move between runs. Pin
// coordinates that only hold on one island and the suite breaks on any
// shape change; instead grab land cells from the grid at runtime. Buildings
// now have multi-tile footprints (factory 4x3, house 4x2), so "a cell" is
// really "an anchor cell whose whole footprint fits on free land".
function findAnchor(state: SimState, kind: BuildingKind): [number, number] | null {
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      let ok = true;
      for (const cell of footprintCells(r, c, kind)) {
        if (
          cell.row < 0 ||
          cell.row >= GRID_H ||
          cell.col < 0 ||
          cell.col >= GRID_W ||
          !isLand(cell.row, cell.col) ||
          state.grid[cell.row][cell.col]
        ) {
          ok = false;
          break;
        }
      }
      if (ok) return [r, c];
    }
  }
  return null;
}

function needAnchor(state: SimState, kind: BuildingKind): [number, number] {
  const a = findAnchor(state, kind);
  if (!a) throw new Error(`no valid anchor for ${kind} on this island`);
  return a;
}

/** First `n` distinct land cells (seeded trees are 1x1, any grass cell works). */
function findLandCells(n: number): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < GRID_H && cells.length < n; r++) {
    for (let c = 0; c < GRID_W && cells.length < n; c++) {
      if (isLand(r, c)) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** Farm-only mirror of the engine's water-adjacency rule (perimeter ring). */
function farmPerimeterTouchesWater(row: number, col: number): boolean {
  const def = BUILDING_DEFS.monoculture_farm;
  const rowBack = Math.floor((def.footH - 1) / 2);
  const rowFront = Math.floor(def.footH / 2);
  const colBack = Math.floor((def.footW - 1) / 2);
  const colFront = Math.floor(def.footW / 2);
  for (let r = row - rowBack - 1; r <= row + rowFront + 1; r++) {
    for (let c = col - colBack - 1; c <= col + colFront + 1; c++) {
      if (r < 0 || r >= GRID_H || c < 0 || c >= GRID_W) continue;
      const inside =
        r >= row - rowBack && r <= row + rowFront && c >= col - colBack && c <= col + colFront;
      if (!inside && ISLAND[r][c] === "water") return true;
    }
  }
  return false;
}

/** A farm anchor whose footprint is free land AND (optionally) touches water. */
function findFarmAnchor(state: SimState, needWater: boolean): [number, number] | null {
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      let ok = true;
      for (const cell of footprintCells(r, c, "monoculture_farm")) {
        if (
          cell.row < 0 ||
          cell.row >= GRID_H ||
          cell.col < 0 ||
          cell.col >= GRID_W ||
          !isLand(cell.row, cell.col) ||
          state.grid[cell.row][cell.col]
        ) {
          ok = false;
          break;
        }
      }
      if (ok && farmPerimeterTouchesWater(r, c) === needWater) return [r, c];
    }
  }
  return null;
}

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`, extra ?? "");
  }
}

console.log("1) initial state");
const s0 = createInitialState();
check("money=0 (cut trees to bootstrap)", s0.money === 0);
check("health=100", s0.health === 100);
check("not game over", !s0.gameOver);
check("tick=0", s0.tick === 0);
check("power/food meters zeroed", s0.powerProduced === 0 && s0.powerConsumed === 0 && s0.foodProduced === 0 && s0.foodConsumed === 0);

console.log("1b) seeded starter trees");
const seed = findLandCells(2);
const st = createInitialState(seed);
check("seeded state still starts with $0", st.money === 0);
check(
  "seeded trees placed as eco",
  st.grid[seed[0].row][seed[0].col]?.kind === "eco" && st.grid[seed[1].row][seed[1].col]?.kind === "eco",
);
const cut = removeBuilding(st, seed[0].row, seed[0].col);
check("cutting a wild tree pays $7", cut.ok && cut.state.money === 7);

console.log("2) placement rules");
const [r1, c1] = needAnchor(s0, "factory");
const [r2, c2] = needAnchor(s0, "factory");
let s = s0;
// Fund the seed explicitly: balance isn't the point here, and the island now
// starts with $0 by design.
s.money = 50;
const r = placeBuilding(s, r1, c1, "factory");
check("place factory ok", r.ok);
if (r.ok) s = r.state;
check("money 50-30=20", s.money === 20);
check("anchor cell occupied", s.grid[r1][c1]?.kind === "factory");
check(
  "every footprint cell shares the anchor",
  footprintCells(r1, c1, "factory").every(
    (c) => s.grid[c.row][c.col]?.kind === "factory" && s.grid[c.row][c.col]?.row === r1 && s.grid[c.row][c.col]?.col === c1,
  ),
);
check("can't stack on occupied", !canBuild(s, r1, c1, "factory").ok);
check("can't build on water", !canBuild(s, 0, 0, "factory").ok);
check("can't afford 2nd factory", !placeBuilding(s, r2, c2, "factory").ok);
const [re, ce] = needAnchor(s, "eco");
const r2b = placeBuilding(s, re, ce, "eco");
check("place eco (15) ok", r2b.ok);
if (r2b.ok) s = r2b.state;
check("money now 5 (50-30-15)", s.money === 5);

console.log("3) power: unstaffed factory is fully idle");
let s3 = s; // factory + eco, no people yet
const before3 = s3.money;
s3 = tick(s3);
check("unstaffed factory earns $0", s3.money === before3);
check("idle factory draws no power", s3.powerConsumed === 0);
check("idle factory pollutes nothing (eco -1 clamps to 0)", s3.pollution === 0);

console.log("4) demolish refund");
let s4 = s3;
const rr = removeBuilding(s4, re, ce);
check("remove eco ok", rr.ok);
if (rr.ok) s4 = rr.state;
check("refund 50% of 15 = +7", s4.money === s3.money + 7);
check("cell freed", s4.grid[re][ce] === null);

console.log("4b) demolish resolves from any footprint cell");
const s4b = s3; // still has the factory anchored at (r1,c1)
const interior = footprintCells(r1, c1, "factory").at(-1);
const rd = interior ? removeBuilding(s4b, interior.row, interior.col) : { ok: false as const };
check("demolish from footprint interior ok", rd.ok);
if (rd.ok) {
  const s4c = rd.state;
  check("refund 50% of 30 = +15", s4c.money === s3.money + 15);
  check(
    "whole footprint freed",
    footprintCells(r1, c1, "factory").every((c) => s4c.grid[c.row][c.col] === null),
  );
}

console.log("5) farm requires water adjacency");
let s5 = createInitialState();
s5.money = 1000;
const far = findFarmAnchor(s5, false);
const near = findFarmAnchor(s5, true);
check("island has an interior (non-water-adjacent) spot", far !== null);
check("island has a water-adjacent spot", near !== null);
if (far) {
  const blocked = canBuild(s5, far[0], far[1], "monoculture_farm");
  check("farm blocked away from water", !blocked.ok);
  check("blocked with the water reason", blocked.ok === false && blocked.reason === "Farm needs to touch water");
}
if (near) {
  const p5 = placeBuilding(s5, near[0], near[1], "monoculture_farm");
  check("farm ok next to water", p5.ok);
  if (p5.ok) s5 = p5.state;
  check("farm food +10/tick", tick(s5).foodProduced === 10);
}

console.log("6) food: farm feeds growth, hunger starves");
// A house with no farm cannot hold a population: it grows one tick, then
// starvation (foodProduced 0 < population) pulls it straight back down.
let s6 = createInitialState();
s6.money = 100;
const [rh, ch] = needAnchor(s6, "house");
const ph = placeBuilding(s6, rh, ch, "house");
check("place house ok", ph.ok);
if (ph.ok) s6 = ph.state;
s6 = tick(s6);
check("pop=1 while food covers 0 people", s6.population === 1);
s6 = tick(s6);
check("starvation pulls pop back to 0", s6.population === 0);
check("foodConsumed tracks population", s6.foodConsumed === 1);

// A farm plus a house: food covers the people, so growth sticks.
let s6b = createInitialState();
s6b.money = 1000;
// findFarmAnchor gives a water-adjacent spot; use it directly.
const farmSpot = findFarmAnchor(s6b, true);
check("water-adjacent farm spot available", farmSpot !== null);
if (farmSpot) {
  const pf = placeBuilding(s6b, farmSpot[0], farmSpot[1], "monoculture_farm");
  check("place farm ok", pf.ok);
  if (pf.ok) s6b = pf.state;
  const [rhb, chb] = needAnchor(s6b, "house");
  const phb = placeBuilding(s6b, rhb, chb, "house");
  check("place second house ok", phb.ok);
  if (phb.ok) s6b = phb.state;
  s6b = tick(s6b);
  check("farm feeds first person", s6b.foodProduced === 10 && s6b.foodConsumed === 0);
  s6b = tick(s6b);
  check("population grows to 2 when fed", s6b.population === 2);
  check("foodConsumed=1 once populated", s6b.foodConsumed === 1);
}

console.log("6b) housing capacity caps population");
let s6c = createInitialState();
s6c.money = 1000;
const [rhc, chc] = needAnchor(s6c, "house");
let pr6 = placeBuilding(s6c, rhc, chc, "house");
check("place cap-test house ok", pr6.ok);
if (pr6.ok) s6c = pr6.state;
// Two farms (+10 food each) feed a full 20-pop house; four trees offset the
// house(2)+farms(2) pollution so the test runs the full 25 ticks.
for (let i = 0; i < 2; i++) {
  const spotCap = findFarmAnchor(s6c, true);
  check("cap-test farm spot available", spotCap !== null);
  if (!spotCap) break;
  pr6 = placeBuilding(s6c, spotCap[0], spotCap[1], "monoculture_farm");
  check("place cap-test farm ok", pr6.ok);
  if (pr6.ok) s6c = pr6.state;
}
for (let i = 0; i < 4; i++) {
  const [re, ce] = needAnchor(s6c, "eco");
  pr6 = placeBuilding(s6c, re, ce, "eco");
  check("place cap-test offset tree ok", pr6.ok);
  if (pr6.ok) s6c = pr6.state;
}
for (let i = 0; i < 25; i++) s6c = tick(s6c);
check("population caps at 20 (1 house)", s6c.population === 20);
check("housingCapacity reported as 20", s6c.housingCapacity === 20);
check("island survived the cap run", !s6c.gameOver);

console.log("6c) factory staffing: idle until 10 workers");
let sf = createInitialState();
sf.money = 1000;
const [rf, cf] = needAnchor(sf, "factory");
let rs = placeBuilding(sf, rf, cf, "factory");
check("place staffing factory ok", rs.ok);
if (rs.ok) sf = rs.state;
const beforeIdle = sf.money;
sf = tick(sf);
check("unstaffed factory: $0, no power draw", sf.money === beforeIdle && sf.powerConsumed === 0);
check("unstaffed factory pollutes nothing", sf.pollution === 0);
// Staff to 10: house + farm + 3 offset trees (house 2 + farm 1 pollution).
const [rhSt, chSt] = needAnchor(sf, "house");
rs = placeBuilding(sf, rhSt, chSt, "house");
check("place staffing house ok", rs.ok);
if (rs.ok) sf = rs.state;
const farmSpotSt = findFarmAnchor(sf, true);
check("staffing farm spot available", farmSpotSt !== null);
if (farmSpotSt) {
  rs = placeBuilding(sf, farmSpotSt[0], farmSpotSt[1], "monoculture_farm");
  check("place staffing farm ok", rs.ok);
  if (rs.ok) sf = rs.state;
}
for (let i = 0; i < 3; i++) {
  const [re, ce] = needAnchor(sf, "eco");
  rs = placeBuilding(sf, re, ce, "eco");
  check("place staffing offset tree ok", rs.ok);
  if (rs.ok) sf = rs.state;
}
for (let i = 0; i < 10; i++) sf = tick(sf);
check("staffed population reaches 10", sf.population === 10);
// Staffed but powerless: the factory RUNS (pollutes + draws power) but earns $0.
const beforeNoPower = sf.money;
sf = tick(sf);
check("staffed+powerless factory earns $0", sf.money === beforeNoPower);
check("staffed factory draws power (5 + house 1)", sf.powerConsumed === 6);
check("staffed factory pollutes (+3 over the offsets)", sf.pollution === 3);
// Add a coal plant: power covers the 6 draw, full income resumes.
const [rc, cc] = needAnchor(sf, "coal_plant");
rs = placeBuilding(sf, rc, cc, "coal_plant");
check("place staffing coal ok", rs.ok);
if (rs.ok) sf = rs.state;
const beforePowered = sf.money;
sf = tick(sf);
check("staffed+powered factory earns +$3", sf.money === beforePowered + 3);
check("coal feeds the factory", sf.powerProduced === 15 && sf.powerConsumed === 6);

console.log("7) game over from over-extraction");
let s7 = createInitialState();
let placed = 0;
// 5 coal plants = +30 pollution/tick. Factories now need 10 workers before
// they pollute, so coal is the reliable over-extraction path for this check.
// Fund the scenario explicitly — money is irrelevant to the death check.
for (let i = 0; i < 5; i++) {
  const [ra, ca] = needAnchor(s7, "coal_plant");
  s7.money = 1000;
  const res = placeBuilding(s7, ra, ca, "coal_plant");
  if (res.ok) {
    s7 = res.state;
    placed++;
  }
}
check("placed 5 coal plants", placed === 5);
let ticks = 0;
while (!s7.gameOver && ticks < 500) {
  s7 = tick(s7);
  ticks++;
}
check("island dies", s7.gameOver, { ticks });
check("health floors at 0", s7.health === 0);
check("tick() freezes after game over", tick(s7).tick === s7.tick);

console.log("8) population growth needs health >= 40");
let s8 = createInitialState();
s8.money = 100;
const [rh8, ch8] = needAnchor(s8, "house");
const ph8 = placeBuilding(s8, rh8, ch8, "house");
check("place house ok", ph8.ok);
if (ph8.ok) s8 = ph8.state;
s8 = tick(s8);
check("pop grows while healthy", s8.population === 1);
// Tank the health, then population must shrink.
let s8b = s8;
for (let i = 0; i < 200 && !s8b.gameOver; i++) {
  s8b = tick(s8b); // no factories, so pollution only from the house (+2/tick)
}
// At this point pollution hit 100 (house alone does it) -> game over.
check("house alone eventually kills island", s8b.gameOver);

console.log("9) win at TARGET_DAYS");
let s9 = createInitialState();
// A pollution-neutral build (1 factory + 4 eco = -1 pollution/tick) survives
// forever; fund it explicitly because balance isn't the point of this test.
s9.money = 1000;
const [wf, wc] = needAnchor(s9, "factory");
const pf9 = placeBuilding(s9, wf, wc, "factory");
check("place winning factory ok", pf9.ok);
if (pf9.ok) s9 = pf9.state;
for (let i = 0; i < 4; i++) {
  const [we, wce] = needAnchor(s9, "eco");
  const pe = placeBuilding(s9, we, wce, "eco");
  check("place offsetting tree ok", pe.ok);
  if (pe.ok) s9 = pe.state;
}
let survived = 0;
while (!s9.gameOver && !s9.won && survived < TARGET_DAYS + 10) {
  s9 = tick(s9);
  survived++;
}
check("won before game over", s9.won && !s9.gameOver);
check(`won exactly at tick ${TARGET_DAYS}`, s9.tick === TARGET_DAYS);
check("can't build after winning", !canBuild(s9, wf, wc, "factory").ok);
check("tick() freezes after winning", tick(s9).tick === s9.tick);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);