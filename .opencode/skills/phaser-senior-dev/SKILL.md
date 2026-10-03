---
name: phaser-senior-dev
description: Use when working on this repo's Solovra island-survival game — Phaser 3 iso-grid rendering, the SimulationEngine, the event-bus bridge, building placement, React HUD/menu/modal overlays, assets, balance tuning, or Antirez-style code conventions.
---

# Solovra — Architecture & Conventions

Project-specific operating manual. Read this before touching game code so
future changes respect the invariants that keep the sim deterministic, the
Phaser/React boundary clean, and the code readable.

## Stack & versions (pinned — don't "latest" these)

- Next.js 15.5, App Router, React 19, TypeScript strict, Tailwind v4.
- **Phaser `3.90.0`**. The npm `latest` tag is Phaser 4.x with breaking API
  changes; this project deliberately pins 3.x. When adding/upgrading Phaser,
  install `phaser@3.90.0`, never `phaser` or `@4`.
- Deploys statically on Vercel; no server APIs, no Edge runtime code.
- Art is Kenney CC0. Both packs ("Isometric Tiles Landscape" and
  "Isometric Tiles Buildings") are vendored as TexturePacker atlases under
  `public/assets/kenney/`; licenses live beside them (`.../LICENSE.txt`) and
  the older per-file credit is in `public/assets/tiles/LICENSE.txt`.

## File map

| Path | Role |
| --- | --- |
| `game/config.ts` | Phaser.Game config: 900×640 design res, `Scale.FIT`, scenes |
| `game/events/bus.ts` | Typed `EventBus` — the ONLY Phaser⇄React channel |
| `game/engine/simulation.ts` | Pure, deterministic sim: `SimState`, `tick()`, place/demolish |
| `game/data/tiles.ts` | Iso constants, `TILE_FRAME` (ground art), `BUILDING_DEFS` (balance) |
| `game/data/island.json` | Generated 10×10 water/grass grid (regenerate, don't hand-edit) |
| `game/scenes/BootScene.ts` | Preloads the Kenney atlases, bakes ghost/placeholder textures |
| `game/scenes/MainScene.ts` | Atlas-sprite ground + buildings, input, tick loop, owns authoritative `SimState` |
| `game/scenes/TileInspectorScene.ts` | `/test` atlas frame inspector (tap a tile → frame id) |
| `components/GameView.tsx` | Client shell; `next/dynamic` import of GameCanvas (`ssr:false`) |
| `components/GameCanvas.tsx` | Phaser mount + `game.destroy(true)` on unmount |
| `components/ui/*` | HUD, BuildingMenu, GameOverModal, `useGameBridge` hook |
| `scripts/gen-island.mjs` | Deterministic island generator (edit this, then rerun) |
| `scripts/sim-test.ts` | Sim sanity checks (19 asserts) |

## Architecture invariants (the rules that keep it from rotting)

1. **SSR boundary**: Phaser only runs inside `GameCanvas`, loaded via
   `next/dynamic(..., { ssr: false })`. Never import Phaser into React state or
   server components. `GameCanvas` must destroy the game on unmount
   (`game.destroy(true)`) — this prevents WebGL context leaks across React
   StrictMode double-mounts and hot reloads. Preserve it.
2. **Event bus is the only bridge**: Phaser and React communicate exclusively
   through the `bus` singleton in `game/events/bus.ts`. Never pass React
   `setState` into the Phaser update loop (thrashes at 60fps). React state
   updates only on discrete bus events (`sim:update` fires ≤1/s).
3. **Pure simulation**: `SimulationEngine` has no Phaser imports and no RNG.
   `tick(state)` and all mutations are *functional* — they return a new state
   and never mutate the argument. `MainScene` owns the single authoritative
   `SimState`; the UI snapshots it for display.
4. **Single source of truth for balance**: costs/income/pollution/population
   live in `BUILDING_DEFS` in `game/data/tiles.ts`. Textures are opaque string
   keys resolved by `BootScene`, so logic never depends on art. Changing a
   building touches: `BUILDING_DEFS` (+ optionally `BUILDING_ORDER`) in
   `tiles.ts`, and the texture registration in `BootScene.preload`.

## Iso grid reference (measured from the art — don't guess)

- `ISO = { TILE_W: 132, TILE_H: 66, HALF_W: 66, HALF_H: 33 }`.
- World position of cell `(row, col)`: `x = (col - row) * HALF_W`,
  `y = (row + col) * HALF_H`. Object sprites anchor `(0.5, 1)` (bottom-center).
- **Ground = one atlas sprite per cell.** `renderTiles()` places a landscape
  frame (`TILE_FRAME[kind]`) at each cell, anchored at the TOP FACE's bottom
  vertex (`GROUND_ORIGIN_Y = 67/83` of the 132×83 frame) so the visible 132×66
  diamond lands exactly on the cell. Each frame is a **132×83 block**: the top
  face is a 132×66 diamond at frame y=1..67 (top vertex y=1, widest y=34, bottom
  vertex y=67); y=68..81 is the soil side, hidden by the tile in front. There is
  no tilemap and no baked sheet — and no separate decoration concept; every cell
  is the same kind of object.
- Everything (ground tiles, buildings, ghost) is a sprite on one `Container`.
  Ground depth is `(row+col)*2+1`, buildings `(row+col)*2+2`; **call
  `container.sort("depth")` after adding** — Container children render in
  insertion order and ignore per-child depth otherwise.
- The whole map is one `Container`, fitted by the camera. Pointer→cell
  conversion goes through `container.getLocalPoint()` then the inverse iso
  transform, with a diamond-inside check to reject corner hits.
- Kenney ground/building PNGs are **132×83 / 133×127 etc. frames**. Ghost
  diamonds in `BootScene` copy the ground **top face** (frame y=1..67) and the
  ghost outline is anchored top-left to the ground frame, so it nests with the
  ground sprites; the debug placeholder is bottom-anchored so it sits on a cell
  like a real object.

## Event map

| Event | Direction | Payload |
| --- | --- | --- |
| `sim:update` | Phaser → React | `SimState` (after each tick or mutation) |
| `sim:gameover` | Phaser → React | `SimState` |
| `build:select` | React → Phaser | `BuildingKind \| null` |
| `build:placed` | Phaser → React | `{ row, col, kind }` |
| `build:removed` | Phaser → React | `{ row, col }` |
| `ui:error` | Phaser → React | string toast |
| `sim:restart` | React → Phaser | — |

Standard flow: menu emits `build:select` → MainScene shows ghost + validates →
tap places/demolishes via the pure engine → Phaser emits `sim:update` so the
HUD re-renders. Restart is a bus event (no page reload).

## Coding conventions (Antirez standard)

- Comment the **why**, not the what. `x = x + 1` gets no comment; the boundary
  condition it avoids does. State-flow and memory decisions get explicit notes.
- No abstraction bloat: no needless interfaces/patterns; duplicate a 3-line
  loop before extracting a "utility". Keep it readable.
- Shortcuts for hackathon speed must be tagged
  `/* HACKATHON_TRADE_OFF: ... */` with the production refactor spelled out.
- The event bus stays `any`-free (tuple-style event map, see `bus.ts`).
- Mobile/touch rules are already in place — preserve them: `touch-action:
  none` on the canvas root, tap-vs-drag 6px threshold, pointer-id guard for
  multi-touch, safe-area insets, `Scale.FIT` so input stays in design space.

## Commands

```bash
npm run build           # production build (also runs tsc + lint)
npx tsc --noEmit        # typecheck
npx eslint .            # lint
npx tsx scripts/sim-test.ts    # sim sanity checks — run after any balance/engine change
node scripts/gen-island.mjs    # regenerate game/data/island.json (edit generator, not JSON)
npm run dev             # dev server (StrictMode double-mounts — GameCanvas must survive it)
```

## Common tasks

- **Add a building kind**: extend `BuildingKind` + `BUILDING_DEFS` (and
  `BUILDING_ORDER` if it should appear in the menu) in `game/data/tiles.ts`.
  `texture` is an atlas frame name already loaded (`buildingTiles_NNN.png` /
  `landscapeTiles_NNN.png`), so no `BootScene` change is needed. Re-run
  `sim-test.ts` if it has tick effects.
- **Rebalance**: only touch `BUILDING_DEFS` numbers. Keep pollution/house
  dynamics in the 0–100 `MAX_POLLUTION` range; health = 100 − pollution.
- **Change the island shape**: edit `scripts/gen-island.mjs` (deterministic, no
  RNG) and rerun it. Don't hand-edit `island.json`.
- **Change the ground art**: point `TILE_FRAME` in `game/data/tiles.ts` at a
  different landscape atlas frame. Ground frames must be 132×83 flat diamonds
  (the visible top face is the 132×66 diamond at frame y=1..67) so
  `GROUND_ORIGIN_Y = 67/83` keeps them on the grid. Use the `/test` inspector to
  find frame ids.
- **Add Kenney/free art**: both packs load as TexturePacker atlases, so any
  frame is available by sheet name with no preload edit. If you add a new
  pack, vendor the `Spritesheet/*.png` + `*.xml` and `load.atlas` it in
  `BootScene.preload`; verify unlabeled frames by pixel analysis (avg color +
  row-extent geometry) and record the CC0 credit beside the assets.

## Known constraints / trade-offs

- Ground and buildings are both depth-sorted sprites on one container; no
  tilemap, no baked sheet, no decoration layer. No camera panning — the island
  fits via `Scale.FIT`.
- Water is a real pale-aqua frame from the landscape pack (`landscapeTiles_066`,
  the pack has no deep-blue ocean tile); grass is `landscapeTiles_000`
  (verified by pixel analysis).
- 1-cell footprints only; multi-tile buildings would need footprint arrays in
  the engine + overlap depth handling.
- Population/pollution are global meters, not spatially diffused — a diffusion
  model is the documented future refactor (interface already supports it).