# POLLISLAND

A sci-fi society simulator. Crash-landed on an uncharted island, you are the
last human awake in the wreck — and the only one who can manage the colony.
No rescue is coming. Build a society that can outlast the smoke and the sea.

> Built with Phaser 3 + Next.js 15. Plays on desktop and mobile.

---

## The mission

You start with $50, an empty island, and 365 days to prove a settlement can
survive. Every day the simulation ticks: buildings earn money, pollute the
air, and grow the population. Balance all three or the island dies.

- **Factories** earn money — but pump out pollution.
- **Houses** grow your population — but they only take root while the island
  is healthy.
- **Trees** clean the air, cancelling out factory smoke.

Health is simply `100 − pollution`. Push pollution to 100 and the island
falls. Survive to day 365 and PollIsland is yours.

[screenshot: the island, mid-game, with a settlement and the HUD]

## How to play

| Building | Cost | Effect per day | How it earns its keep |
| --- | --- | --- | --- |
| Factory | $30 | +$3 income, +3 pollution | Money engine |
| House | $20 | +1 population (needs health ≥ 40) | Growth engine |
| Tree | $15 | −1 pollution | Pollution scrubber |

- Pick a building from the bottom bar — a translucent ghost follows your
  cursor/finger, tinted **green** where it can be placed and **red** where it
  can't (water, edge of the island, already occupied).
- **Tap or drag** onto a tile to build it. Multi-tile buildings (factories and
  houses span several tiles) centre on the tile you tap.
- Tap any placed building to **demolish** it and refund half its cost.
- Demolishing frees land and money, so you can pivot when the smoke gets thick.

### Controls

- **Desktop:** `1` / `2` / `3` select a building, `Esc` cancels, mouse-wheel
  zooms, drag pans, right-click deselects.
- **Mobile:** pinch to zoom, two-finger drag to pan, tap to place/demolish —
  the UI is built for thumbs, with safe-area insets.

[screenshot: build menu with ghost placement on the island]

---

## For developers

### Tech stack

- **Phaser 3.90** (WebGL, pinned — do not bump to 4.x, breaking API changes)
- **Next.js 15** App Router, **React 19**, **TypeScript** strict, **Tailwind v4**
- Static deploy on Vercel — no server APIs, no Edge runtime
- Art is Kenney CC0, vendored under `public/assets/`

### Project structure

| Path | Role |
| --- | --- |
| `game/config.ts` | Phaser.Game config: 900×640 design res, `Scale.FIT`, WEBGL, scenes |
| `game/events/bus.ts` | Typed `EventBus` — the only Phaser ⇄ React channel |
| `game/engine/simulation.ts` | Pure, deterministic sim: `SimState`, `tick()`, place/demolish |
| `game/engine/isoMesh.ts` | Pure OBJ → iso-vertex projector feeding `Mesh.addVertices` |
| `game/data/tiles.ts` | Iso constants, ground art frames, `BUILDING_DEFS` (all balance) |
| `game/data/island.json` | Generated 30×30 water/grass grid (regenerate, don't hand-edit) |
| `game/scenes/*` | Boot (preloads art/models), Main (render + input + tick) |
| `components/GameCanvas.tsx` | Phaser mount via `next/dynamic(ssr:false)`; destroys game on unmount |
| `components/ui/*` | HUD, BuildingMenu, start/win/game-over screens, `useGameBridge` |
| `scripts/gen-island.mjs` | Deterministic island generator |
| `scripts/sim-test.ts` | Sim sanity checks |

### Architecture notes

- **SSR boundary.** Phaser only ever runs inside `GameCanvas`, loaded with
  `ssr:false`. React never imports Phaser.
- **Event bus is the only bridge.** Phaser and React communicate exclusively
  through the typed `bus` singleton. React state updates only on discrete
  events (`sim:update` fires ≤1/s), never per frame.
- **Pure simulation.** The engine has no Phaser imports and no RNG. `tick()`
  and all mutations return a new state and never mutate their argument.
  `MainScene` owns the single authoritative `SimState`.
- **Buildings are 3D meshes.** OBJ models are projected onto the iso grid by
  `projectObj()`; missing assets fall back to 2D atlas sprites.
- **Single source of balance.** Costs, income, pollution, and population all
  live in `BUILDING_DEFS` in `game/data/tiles.ts`. Textures and models are
  opaque string keys, so logic never depends on art.

### Getting started

```bash
npm install
npm run dev          # dev server (StrictMode double-mounts; GameCanvas survives it)
```

Verify your changes:

```bash
npm run build                        # production build (runs tsc + lint)
npx tsc --noEmit                     # typecheck
npx eslint .                         # lint
npx tsx scripts/sim-test.ts          # sim sanity checks
```

### Contributing notes

- **Rebalance a building:** touch only the numbers in `BUILDING_DEFS`
  (`game/data/tiles.ts`). Keep pollution/health in the 0–100 range.
- **Change the island shape:** edit `scripts/gen-island.mjs`, then rerun it —
  never hand-edit `game/data/island.json`.
- **Swap a model:** drop the OBJ + colormap into `public/assets/models/<dir>/`
  and update `def.model`. Recompute `scale`/offsets from the new bounding box.
- Follow the existing code conventions: comment the *why*, not the what, and
  tag hackathon shortcuts with `/* HACKATHON_TRADE_OFF: ... */`.

### Roadmap ideas

- Spatially diffused pollution instead of a single global meter
- Camera snapping and a minimap
- More building kinds and an in-game economy UI

---

## Credits

- **Kenney** isometric landscape & building packs and ground tiles — CC0.
  Licenses live beside the assets: `public/assets/kenney/isometric-landscape/LICENSE.txt`,
  `public/assets/kenney/isometric-buildings/LICENSE.txt`,
  `public/assets/tiles/LICENSE.txt`.
- Building 3D models are Kenney CC0, textured via per-model colormap atlases.