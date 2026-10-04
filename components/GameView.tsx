"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { HUD } from "@/components/ui/HUD";
import { BuildingMenu } from "@/components/ui/BuildingMenu";
import { TutorialDialog } from "@/components/ui/TutorialDialog";
import { GameOverModal } from "@/components/ui/GameOverModal";
import { WinModal } from "@/components/ui/WinModal";
import { StartMenu } from "@/components/ui/StartMenu";
import { bus } from "@/game/events/bus";

/**
 * Client-only shell. Phaser requires `window`/DOM so the canvas is loaded via
 * a dynamic import with ssr:false — nothing Phaser-related ever runs on the
 * server. React overlays (HUD, menu, modal, start/win screens) sit on top of
 * the canvas and talk to the game exclusively through the typed bus.
 *
 * `phase` is purely a UI concern: whether to show the start menu or not. The
 * sim's own "started" state lives in MainScene (the tick timer), so a fresh
 * Phaser game always boots paused and React resumes it via sim:start on
 * sim:boot.
 */
const GameCanvas = dynamic(() => import("@/components/GameCanvas"), {
  ssr: false,
});

export default function GameView() {
  const [phase, setPhase] = useState<"menu" | "playing">("menu");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    // A remounted MainScene (dev StrictMode/HMR) boots paused. If the player
    // had already started the run, resume ticking; on first load the phase is
    // "menu", so nothing starts until the start screen says Go.
    return bus.on("sim:boot", () => {
      if (phaseRef.current !== "menu") bus.emit("sim:start");
    });
  }, []);

  const begin = (): void => {
    bus.emit("sim:start");
    setPhase("playing");
  };

  return (
    <div className="relative h-full w-full">
      <GameCanvas />
      <HUD />
      <BuildingMenu />
      <TutorialDialog />
      <GameOverModal />
      <WinModal />
      {phase === "menu" && <StartMenu onStart={begin} />}
    </div>
  );
}