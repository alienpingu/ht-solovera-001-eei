"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { inspectorEvents } from "@/game/test/inspectorEvents";
import type { TilePick } from "@/game/test/inspectorEvents";

/**
 * Client-only shell for the tile inspector. Phaser is loaded with ssr:false
 * (same boundary as the game) and the picked frame id is rendered as a plain
 * HTML overlay so it stays crisp regardless of the camera zoom.
 */
const TestGameCanvas = dynamic(() => import("@/components/test/TestGameCanvas"), {
  ssr: false,
});

export default function TestGameView() {
  const [picked, setPicked] = useState<TilePick | null>(null);

  useEffect(() => inspectorEvents.onTile(setPicked), []);

  return (
    <div className="relative h-full w-full">
      <TestGameCanvas />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 select-none p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-xl rounded-xl bg-black/70 px-4 py-2 font-mono text-sm shadow-lg backdrop-blur-sm">
          {picked ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-emerald-300">{picked.frame}</span>
              <span className="text-xs text-slate-300">
                sheet={picked.sheet} · cell=({picked.row},{picked.col}) · index={picked.index}/
                {picked.total}
              </span>
            </div>
          ) : (
            <span className="text-slate-300">Tap any tile to read its frame id</span>
          )}
        </div>
      </div>
    </div>
  );
}
