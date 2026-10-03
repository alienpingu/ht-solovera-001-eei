# Solovra — Island Survival

This repo is a Phaser 3 + Next.js 15 game (isometric island survival sim).
Before making changes, load the `phaser-senior-dev` skill — it documents the
architecture invariants (SSR boundary, event-bus bridge, pure simulation
engine), the measured iso-grid constants, and the Antirez-style coding
conventions this project follows.

Quick reference:
- Verify with `npm run build`, `npx tsc --noEmit`, `npx eslint .`.
- Sim sanity: `npx tsx scripts/sim-test.ts`.
- Island map is generated: edit `scripts/gen-island.mjs`, never hand-edit
  `game/data/island.json`.