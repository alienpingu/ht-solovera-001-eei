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
    if (!rootRef.current || gameRef.current) return;

    const game = new Phaser.Game(GAME_CONFIG);
    gameRef.current = game;

    return () => {
      game.destroy(true);
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