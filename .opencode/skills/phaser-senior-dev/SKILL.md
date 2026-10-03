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
| `game/data/tiles.ts` | Iso constants, `GROUND_SHEET_INDEX`, `BUILDING_DEFS` (balance), `DECOR` |
| `game/data/island.json` | Baked 10×10 ground grid + decor scatter (regenerate, don't hand-edit) |
| `game/scenes/BootScene.ts` | Preloads the Kenney atlases + baked ground sheet, bakes ghost textures |
| `game/scenes/MainScene.ts` | Iso tilemap ground + sprite objects, input, tick loop, owns authoritative `SimState` |
| `components/GameView.tsx` | Client shell; `next/dynamic` import of GameCanvas (`ssr:false`) |
| `components/GameCanvas.tsx` | Phaser mount + `game.destroy(true)` on unmount |
| `components/ui/*` | HUD, BuildingMenu, GameOverModal, `useGameBridge` hook |
| `scripts/gen-island.mjs` | Deterministic island generator (edit this, then rerun) |
| `scripts/build-kenney-sheets.mjs` | Bakes the uniform ground tileset from the Kenney atlas |
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
- **Ground = a real Phaser iso Tilemap layer.** `renderGround()` flips a blank
  map to `Orientation.ISOMETRIC`, adds the baked `ground-sheet` tileset
  (`tileWidth=132`, frame height 83, `tileOffset.y=17`) and `putTileAt`s each
  cell. The offset replicates the old bottom-anchored sprite rendering: the
  ground art spans y=1..81 (measured by pixel analysis; the earlier "y=15..81"
  note was wrong), so its bottom vertex lands 2px above the cell's bottom
  vertex and every tile overlaps the row behind uniformly. `skipCull = true`
  on the tiny map; the layer is positioned `ISO.TILE_H * scale` above the
  container because its origin is the cell's TOP vertex.
- Objects (buildings, decor, ghost) stay **sprites on a scaled `Container`**:
  their frames vary in height (trees 132×131, houses 133×127, machines 99×60)
  so they don't fit a uniform tileset. Depth is `(row+col)*2+1`; **call
  `container.sort("depth")` after adding** — Container children render in
  insertion order and ignore per-child depth otherwise.
- The whole map is one scaled `Container` + the scaled ground layer, fitted by
  `fitMapToViewport()`. Pointer→cell conversion goes through
  `container.getLocalPoint()` then the inverse iso transform, with a
  diamond-inside check to reject corner hits.
- Kenney ground/building PNGs are **132×83 / 133×127 etc. frames**; the ground
  art is bottom-anchored (bottom vertex y=81). Ghost textures in `BootScene`
  copy the measured y=1..81 geometry or they won't nest with the ground.

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
  `/* HACKATHON_TRADE_OFF: ... */` with the production refactor spelled out
  (e.g. keeping building/decor as depth-sorted sprites instead of baking a
  second uniform tileset with a y-offset for a buildings tilemap layer).
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
node scripts/build-kenney-sheets.mjs  # rebake public/assets/tiles/ground-sheet.png from the atlas
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
- **Change the island shape / decor**: edit `scripts/gen-island.mjs`
  (deterministic, no RNG) and rerun it. Don't hand-edit `island.json`. Decor
  is a render-only `[{ row, col, frame }]` list; buildings clear the decor on
  their cell and demolish restores it.
- **Add a ground kind**: pick a 132×83 ground frame from the landscape atlas,
  add it to `GROUND_FRAMES` in `scripts/build-kenney-sheets.mjs` (keep the
  order in sync with `GROUND_SHEET_INDEX` in `tiles.ts`), extend `GroundKind`,
  rerun the bake, and update `gen-island.mjs`.
- **Add Kenney/free art**: both packs load as TexturePacker atlases, so any
  frame is available by sheet name with no preload edit. If you add a new
  pack, vendor the `Spritesheet/*.png` + `*.xml` and `load.atlas` it in
  `BootScene.preload`; verify unlabeled frames by pixel analysis (avg color +
  row-extent geometry) and record the CC0 credit beside the assets.

## Known constraints / trade-offs

- Ground is a Phaser iso Tilemap layer; objects (buildings/decor) are
  depth-sorted sprites on a container. No camera panning — the island fits via
  `Scale.FIT`.
- Water is a real pale-aqua frame from the landscape pack (`landscape_044`);
  the pack has no deep-blue ocean tile (verified by pixel analysis).
- 1-cell footprints only; multi-tile buildings would need footprint arrays in
  the engine + overlap depth handling.
- Population/pollution are global meters, not spatially diffused — a diffusion
  model is the documented future refactor (interface already supports it).