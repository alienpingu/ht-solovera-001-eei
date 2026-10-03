"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { TEST_GAME_CONFIG } from "@/game/config.test";

/**
 * Phaser mount for the /test tile inspector. Same lifecycle contract as
 * GameCanvas: build one frame after mount (so StrictMode's double-invoke
 * cancels the first attempt) and fully destroy on unmount to release the
 * WebGL context.
 */
export default function TestGameCanvas() {
  const rootRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    let frame = 0;
    const start = (): void => {
      if (!rootRef.current || gameRef.current) return;
      gameRef.current = new Phaser.Game(TEST_GAME_CONFIG);
    };
    frame = requestAnimationFrame(start);

    return () => {
      cancelAnimationFrame(frame);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id="test-game-root" ref={rootRef} className="absolute inset-0 touch-none" />;
}
