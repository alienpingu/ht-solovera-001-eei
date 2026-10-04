---
name: phaser-senior-dev
description: Use when working on this repo's PollIsland island-survival game — Phaser 3 iso-grid rendering, the SimulationEngine, the event-bus bridge, building placement, React HUD/menu/modal overlays, assets, balance tuning, or Antirez-style code conventions.
---

# PollIsland — Architecture & Conventions

Project-specific operating manual. Read this before touching game code so
future changes respect the invariants that keep the sim deterministic, the
Phaser/React boundary clean, and the code readable.

## Stack & versions (pinned — don't "latest" these)

- Next.js 15.5, App Router, React 19, TypeScript strict, Tailwind v4.
- **Phaser `3.90.0`**. The npm `latest` tag is Phaser 4.x with breaking API
  changes; this project deliberately pins 3.x. When adding/upgrading Phaser,
  install `phaser@3.90.0`, never `phaser` or `@4`.
- Deploys statically on Vercel; no server APIs, no Edge runtime code.
- Renderer is pinned to **WebGL** (`Phaser.WEBGL`, not AUTO): buildings are
  Phaser **Mesh** game objects, which have no Canvas counterpart.
- Ground/water art is Kenney CC0, vendored as TexturePacker atlases under
  `public/assets/kenney/`; licenses live beside them (`.../LICENSE.txt`) and
  the older per-file credit is in `public/assets/tiles/LICENSE.txt`.
- Buildings are 3D Kenney models under `public/assets/models/<kind>/`
  (`<model>.obj` + `colormap.png` + `<preview>.png` for the menu button). The
  OBJ is triangulated Wavefront with UVs into its own `colormap.png`; the MTL
  is ignored (Phaser can't load `map_Kd`, its `Kd` is white).

## File map

| Path | Role |
| --- | --- |
| `game/config.ts` | Phaser.Game config: 900×640 design res, `Scale.FIT`, WEBGL, scenes |
| `game/events/bus.ts` | Typed `EventBus` — the ONLY Phaser⇄React channel |
| `game/engine/simulation.ts` | Pure, deterministic sim: `SimState`, `tick()`, place/demolish, multi-tile footprints |
| `game/engine/isoMesh.ts` | Pure OBJ→iso-vertex projector (feeds `Mesh.addVertices`) |
| `game/data/tiles.ts` | Iso constants, `TILE_FRAME` (ground art), `BUILDING_DEFS` (balance + footprints + model config) |
| `game/data/island.json` | Generated 30×30 water/grass grid (regenerate, don't hand-edit) |
| `game/scenes/BootScene.ts` | Preloads Kenney atlases + OBJ/colormap models, bakes ghost/placeholder textures |
| `game/scenes/MainScene.ts` | Atlas-sprite ground + **Mesh** buildings, input, tick loop, owns authoritative `SimState` |
| `components/GameView.tsx` | Client shell; `next/dynamic` import of GameCanvas (`ssr:false`) |
| `components/GameCanvas.tsx` | Phaser mount + `game.destroy(true)` on unmount |
| `components/ui/*` | HUD, BuildingMenu, GameOverModal, `useGameBridge` hook |
| `scripts/gen-island.mjs` | Deterministic island generator (edit this, then rerun) |
| `scripts/sim-test.ts` | Sim sanity checks (multi-tile placement, no double-count tick) |

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
   live in `BUILDING_DEFS` in `game/data/tiles.ts`. Textures/models are opaque
   string keys resolved by `BootScene`, so logic never depends on art. Changing
   a building touches: `BUILDING_DEFS` (+ optionally `BUILDING_ORDER`) in
   `tiles.ts`, and (only for new asset files) the load lines in
   `BootScene.preload`.

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
- Everything (ground tiles, buildings, ghost) is one `Container`. Ground depth
  is `(row+col)*2+1`; a building sorts by its **front-most footprint cell**:
  `(row+rowFront+col+colFront)*2+2` (rowFront/colFront = half the footprint).
  **Call `container.sort("depth")` after adding** — Container children render in
  insertion order and ignore per-child depth otherwise. Meshes have a `depth`
  property and sort like sprites; adding a Mesh to the container also registers
  it on the update list so its `preUpdate` computes vertex transforms.
- **Buildings are 3D Meshes.** `projectObj()` in `game/engine/isoMesh.ts`
  transforms each OBJ's vertices with the game's own iso projection (Phaser's
  `addVerticesFromObj` can't — its rotation maps one model axis horizontally),
  and `MainScene.buildBuildingMesh` feeds the flat triangles to
  `mesh.addVertices`. The mesh projection is kept 1:1 (one projected unit = one
  world pixel) with `setOrtho(renderer.width, renderer.height)` **and**
  `setSize(...)`, re-applied on every RESIZE (in `fitCamera`). Missing
  model assets fall back to the 2D atlas sprite per kind.
- **Footprints are rectangles.** A building's anchor cell is its footprint
  CENTER; every occupied cell stores the same `{kind,row,col}` anchor record so
  `tick()` counts a building once and a demolish tap on any footprint cell
  resolves the whole rectangle. `canBuild(state,row,col,kind)` validates the
  full footprint. The whole map is one `Container`, fitted by the camera.
  Pointer→cell conversion goes through `container.getLocalPoint()` then the
  inverse iso transform, with a diamond-inside check to reject corner hits.
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
  You must provide: `footW`/`footH` (tile footprint), a `model` config pointing
  at OBJ + colormap + preview under `public/assets/models/<dir>/`, and the
  sprite `sheet`/`texture` fallback. Add matching `load.obj` + `load.image`
  lines in `BootScene.preload`. Re-run `sim-test.ts` if it has tick effects.
- **Swap a model** (new OBJ/colormap): drop the files into the existing folder
  (or a new one) and update `def.model.{dir,obj,tex}`. Recompute `scale` and
  the center offsets from the new model's bounding box —
  `scale = (footW+footH)/(xSpan+zSpan)`, `offsetX = -centerX`,
  `offsetZ = -centerZ` — and eyeball `yawDeg`/`scale` in `npm run dev`. The
  `preview` PNG drives the menu button.
- **Rebalance**: only touch `BUILDING_DEFS` numbers. Keep pollution/house
  dynamics in the 0–100 `MAX_POLLUTION` range; health = 100 − pollution.
- **Change the island shape**: edit `scripts/gen-island.mjs` (deterministic, no
  RNG) and rerun it. Don't hand-edit `island.json`.
- **Change the ground art**: point `TILE_FRAME` in `game/data/tiles.ts` at a
  different landscape atlas frame. Ground frames must be 132×83 flat diamonds
  (the visible top face is the 132×66 diamond at frame y=1..67) so
  `GROUND_ORIGIN_Y = 67/83` keeps them on the grid. Inspect frames by eyeballing
  the atlas sheet directly.
- **Add Kenney/free art**: both packs load as TexturePacker atlases, so any
  frame is available by sheet name with no preload edit. If you add a new
  pack, vendor the `Spritesheet/*.png` + `*.xml` and `load.atlas` it in
  `BootScene.preload`; verify unlabeled frames by pixel analysis (avg color +
  row-extent geometry) and record the CC0 credit beside the assets.

## Known constraints / trade-offs

- Ground and buildings are both depth-sorted objects on one container; no
  tilemap, no baked sheet, no decoration layer. No camera panning — the island
  fits via camera zoom (wheel/pinch/drag pan is supported).
- Water is a real pale-aqua frame from the landscape pack (`landscapeTiles_066`,
  the pack has no deep-blue ocean tile); grass is `landscapeTiles_067`.
- Buildings are WebGL-only Phaser Meshes (textured from per-model Kenney
  colormap PNGs via OBJ UVs); the MTL diffuse color is ignored and UV textures
  (`map_Kd`) are not loadable by Phaser. The renderer is pinned to `Phaser.WEBGL`.
- Footprints are axis-aligned rectangles with a center anchor (tree 1×1,
  house 4×2, factory 4×3). A footprint can't wrap the island edge or overlap
  water/other buildings. Multi-height overlap (tall buildings behind short ones)
  relies on front-most-cell depth sorting; extreme cases may need per-face depth
  work.
- Population/pollution are global meters, not spatially diffused — a diffusion
  model is the documented future refactor (interface already supports it).