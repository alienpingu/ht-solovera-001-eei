import Phaser from "phaser";
import { TileInspectorScene } from "@/game/scenes/TileInspectorScene";

/**
 * Isolated Phaser config for the /test tile inspector. Mirrors the game's
 * render settings (pixelArt/roundPixels/Scale.RESIZE) but boots only the
 * inspector scene into its own parent, so BootScene/MainScene never run here.
 */
export const TEST_GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 900,
  height: 640,
  parent: "test-game-root",
  backgroundColor: "#0b1220",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  render: {
    pixelArt: true,
    roundPixels: true,
    powerPreference: "high-performance",
  },
  scene: [TileInspectorScene],
};
