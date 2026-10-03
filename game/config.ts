import Phaser from "phaser";
import { BootScene } from "@/game/scenes/BootScene";
import { MainScene } from "@/game/scenes/MainScene";

/**
 * Phaser game configuration.
 *
 * Scale.RESIZE makes the canvas match its parent element exactly, so portrait
 * phones get an edge-to-edge view instead of a letterboxed 900x640 frame.
 * MainScene fits the island with the CAMERA (zoom + bounds), not by scaling
 * the container, and re-fits on every `scale` resize event.
 *
 * `pixelArt: true` forces nearest-neighbour sampling (and disables canvas
 * antialiasing): without it the iso tiles are smoothed while being scaled down
 * to fit, which reads as blurry, seam-y "vector" shapes rather than crisp
 * tile art. `roundPixels` keeps object sprites on whole pixels so their
 * bottom-anchored diamonds nest exactly with the ground layer.
 *
 * The renderer is pinned to WEBGL (not AUTO): buildings are Phaser Mesh game
 * objects, which have no Canvas counterpart and silently disappear under the
 * Canvas fallback. Modern browsers all ship WebGL, so this only trades away
 * an increasingly-rare software fallback.
 *
 * The initial width/height only seed the canvas before the parent is measured;
 * RESIZE takes over immediately after.
 */

export const GAME_WIDTH = 900;
export const GAME_HEIGHT = 640;

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "game-root",
  backgroundColor: "#0d1f3c",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: {
    pixelArt: true,
    roundPixels: true,
    powerPreference: "high-performance",
  },
  scene: [BootScene, MainScene],
};
