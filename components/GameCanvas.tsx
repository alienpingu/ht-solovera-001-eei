"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { GAME_CONFIG } from "@/game/config";

/**
 * Phaser lifecycle container. Creates the game once the div exists and
 * destroys it fully on unmount — game.destroy(true) tears down the WebGL
 * context and removes the canvas, which is what prevents leaks and stale
 * canvases across React StrictMode double-mounts and hot reloads.
 */
export default function GameCanvas() {
  const rootRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    // Defer construction by one frame. In dev, React StrictMode runs the
    // effect twice (mount -> cleanup -> mount), and Phaser boots synchronously
    // inside `new Phaser.Game` (DOMContentLoaded fires immediately once the
    // document is interactive). Constructing inline therefore boots a full
    // game — WebGL context, atlas preload, MainScene tick timer — that cleanup
    // destroys a frame later: the Phaser banner printed twice and the atlases
    // were fetched twice. Waiting a frame lets the StrictMode cleanup cancel
    // the first attempt, so exactly one game ever boots. Production effects run
    // once, so this only affects dev.
    let frame = 0;
    const start = (): void => {
      if (!rootRef.current || gameRef.current) return;
      const game = new Phaser.Game(GAME_CONFIG);
      gameRef.current = game;
      // Dev-only handle for debugging input/camera from the console/DevTools.
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __solovra?: Phaser.Game }).__solovra = game;
      }
    };
    frame = requestAnimationFrame(start);

    return () => {
      cancelAnimationFrame(frame);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      id="game-root"
      ref={rootRef}
      className="absolute inset-0 touch-none"
      aria-label="Solovra island game canvas"
    />
  );
}