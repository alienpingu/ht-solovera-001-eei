"use client";

import { bus } from "@/game/events/bus";
import { useGameBridge } from "@/components/ui/useGameBridge";

/**
 * Game-over overlay: shown only when the authoritative SimState reports the
 * island died (pollution reached 100). Score = ticks survived. Restart asks
 * the MainScene to rebuild the run rather than reloading the page.
 */
export function GameOverModal() {
  const { state } = useGameBridge();
  if (!state?.gameOver) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center shadow-2xl">
        <h2 className="text-2xl font-black tracking-tight text-red-400">
          The island has fallen
        </h2>
        <p className="mt-2 text-sm text-white/70">
          Pollution overwhelmed your settlement. You survived{" "}
          <span className="font-bold text-white">{state.tick}</span> day
          {state.tick === 1 ? "" : "s"} with{" "}
          <span className="font-bold text-white">{state.population}</span>{" "}
          people.
        </p>
        <button
          type="button"
          onClick={() => bus.emit("sim:restart")}
          className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-400"
        >
          Start a new island
        </button>
      </div>
    </div>
  );
}