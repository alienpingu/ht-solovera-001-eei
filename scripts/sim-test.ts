// Deterministic smoke test for the simulation engine.
// Run: npx tsx scripts/sim-test.ts
import {
  createInitialState,
  placeBuilding,
  removeBuilding,
  tick,
  canBuild,
  footprintCells,
} from "../game/engine/simulation";
import type { SimState } from "../game/engine/simulation";
import { isLand, GRID_W, GRID_H } from "../game/data/tiles";
import type { BuildingKind } from "../game/data/tiles";

// The island shape is generated, so land cells move between runs. Pin
// coordinates that only hold on one island and the suite breaks on any
// shape change; instead grab land cells from the grid at runtime. Buildings
// now have multi-tile footprints (extractor 4x3, house 4x2), so "a cell" is
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
check("money=50", s0.money === 50);
check("health=100", s0.health === 100);
check("not game over", !s0.gameOver);
check("tick=0", s0.tick === 0);

console.log("2) placement rules");
const [r1, c1] = needAnchor(s0, "extractor");
const [r2, c2] = needAnchor(s0, "extractor");
let s = s0;
const r = placeBuilding(s, r1, c1, "extractor");
check("place extractor ok", r.ok);
if (r.ok) s = r.state;
check("money 50-30=20", s.money === 20);
check("anchor cell occupied", s.grid[r1][c1]?.kind === "extractor");
check(
  "every footprint cell shares the anchor",
  footprintCells(r1, c1, "extractor").every(
    (c) => s.grid[c.row][c.col]?.kind === "extractor" && s.grid[c.row][c.col]?.row === r1 && s.grid[c.row][c.col]?.col === c1,
  ),
);
check("can't stack on occupied", !canBuild(s, r1, c1, "extractor").ok);
check("can't build on water", !canBuild(s, 0, 0, "extractor").ok);
check("can't afford 2nd extractor", !placeBuilding(s, r2, c2, "extractor").ok);
const [re, ce] = needAnchor(s, "eco");
const r2b = placeBuilding(s, re, ce, "eco");
check("place eco (20) ok", r2b.ok);
if (r2b.ok) s = r2b.state;
check("money now 0", s.money === 0);

console.log("3) balanced tick (1 extractor + 1 eco => +$4/tick, +2 pollution)");
let s3 = s;
const before = s3.money;
s3 = tick(s3);
check("money grew by 4 (footprint counted once)", s3.money === before + 4);
check("pollution +2/tick", s3.pollution === 2);
check("health 98", s3.health === 98);
check("tick incremented", s3.tick === 1);

console.log("4) demolish refund");
let s4 = s3;
const rr = removeBuilding(s4, re, ce);
check("remove eco ok", rr.ok);
if (rr.ok) s4 = rr.state;
check("refund 50% of 20 = +10", s4.money === s3.money + 10);
check("cell freed", s4.grid[re][ce] === null);

console.log("4b) demolish resolves from any footprint cell");
const s4b = s3; // still has the extractor anchored at (r1,c1)
const interior = footprintCells(r1, c1, "extractor").at(-1);
const rd = interior ? removeBuilding(s4b, interior.row, interior.col) : { ok: false as const };
check("demolish from footprint interior ok", rd.ok);
if (rd.ok) {
  const s4c = rd.state;
  check("refund 50% of 30 = +15", s4c.money === s3.money + 15);
  check(
    "whole footprint freed",
    footprintCells(r1, c1, "extractor").every((c) => s4c.grid[c.row][c.col] === null),
  );
}

console.log("5) game over from over-extraction");
let s5 = createInitialState();
let placed = 0;
// 5 extractors = +15 pollution/tick. Fund the scenario explicitly — money is
// irrelevant to the death check, so we don't want balance to gate this test.
// findAnchor keeps 4x3 footprints from overlapping.
for (let i = 0; i < 5; i++) {
  const [ra, ca] = needAnchor(s5, "extractor");
  s5.money = 1000;
  const res = placeBuilding(s5, ra, ca, "extractor");
  if (res.ok) {
    s5 = res.state;
    placed++;
  }
}
check("placed 5 extractors", placed === 5);
let ticks = 0;
while (!s5.gameOver && ticks < 500) {
  s5 = tick(s5);
  ticks++;
}
check("island dies", s5.gameOver, { ticks });
check("health floors at 0", s5.health === 0);
check("tick() freezes after game over", tick(s5).tick === s5.tick);

console.log("6) population growth needs health >= 40");
let s6 = createInitialState();
const [rh, ch] = needAnchor(s6, "house");
const ph = placeBuilding(s6, rh, ch, "house");
check("place house ok", ph.ok);
if (ph.ok) s6 = ph.state;
s6 = tick(s6);
check("pop grows while healthy", s6.population === 1);
// Tank the health, then population must shrink.
let s7 = s6;
for (let i = 0; i < 200 && !s7.gameOver; i++) {
  s7 = tick(s7); // no extractors, so pollution only from the house (+1/tick)
}
// At this point pollution hit 100 (house alone does it) -> game over.
check("house alone eventually kills island", s7.gameOver);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);