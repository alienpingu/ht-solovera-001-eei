// Deterministic smoke test for the simulation engine.
// Run: npx tsx scripts/sim-test.ts
import {
  createInitialState,
  placeBuilding,
  removeBuilding,
  tick,
  canBuild,
} from "../game/engine/simulation";

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
let s = s0;
const r = placeBuilding(s, 4, 4, "extractor");
check("place extractor ok", r.ok);
if (r.ok) s = r.state;
check("money 50-30=20", s.money === 20);
check("cell occupied", s.grid[4][4] === "extractor");
check("can't stack on occupied", !canBuild(s, 4, 4).ok);
check("can't build on water", !canBuild(s, 0, 0).ok);
check("can't afford house", !placeBuilding(s, 5, 5, "house").ok);
const r2 = placeBuilding(s, 5, 5, "eco");
check("place eco (20) ok", r2.ok);
if (r2.ok) s = r2.state;
check("money now 0", s.money === 0);

console.log("3) balanced tick (1 extractor + 1 eco => +$4/tick, pollution unchanged)");
let s3 = s;
const before = s3.money;
s3 = tick(s3);
check("money grew by 4", s3.money === before + 4);
check("pollution 0 (no drift)", s3.pollution === 0);
check("health 100", s3.health === 100);
check("tick incremented", s3.tick === 1);

console.log("4) demolish refund");
let s4 = s3;
const rr = removeBuilding(s4, 5, 5);
check("remove eco ok", rr.ok);
if (rr.ok) s4 = rr.state;
check("refund 50% of 20 = +10", s4.money === s3.money + 10);
check("cell freed", s4.grid[5][5] === null);

console.log("5) game over from over-extraction");
let s5 = createInitialState();
let placed = 0;
// 5 extractors = +10 pollution/tick. Fund the scenario explicitly — money is
// irrelevant to the death check, so we don't want balance to gate this test.
for (const [rr2, cc] of [
  [2, 2],
  [2, 7],
  [7, 2],
  [7, 7],
  [4, 4],
] as const) {
  s5.money = 1000;
  const res = placeBuilding(s5, rr2, cc, "extractor");
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
const ph = placeBuilding(s6, 4, 4, "house");
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