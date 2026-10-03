"use client";

import dynamic from "next/dynamic";
import { HUD } from "@/components/ui/HUD";
import { BuildingMenu } from "@/components/ui/BuildingMenu";
import { GameOverModal } from "@/components/ui/GameOverModal";

/**
 * Client-only shell. Phaser requires `window`/DOM so the canvas is loaded via
 * a dynamic import with ssr:false — nothing Phaser-related ever runs on the
 * server. React overlays (HUD, menu, modal) sit on top of the canvas and talk
 * to the game exclusively through the typed event bus.
 */
const GameCanvas = dynamic(() => import("@/components/GameCanvas"), {
  ssr: false,
});

export default function GameView() {
  return (
    <div className="relative h-full w-full">
      <GameCanvas />
      <HUD />
      <BuildingMenu />
      <GameOverModal />
    </div>
  );
}