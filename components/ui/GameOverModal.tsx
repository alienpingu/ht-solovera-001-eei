"use client";

import { bus } from "@/game/events/bus";
import { useGameBridge } from "@/components/ui/useGameBridge";

/**
 * Game-over overlay (NES.css): shown only when the authoritative SimState
 * reports the island died (pollution reached 100). Score = ticks survived.
 * Restart asks the MainScene to rebuild the run rather than reloading the page.
 */
export function GameOverModal() {
  const { state } = useGameBridge();
  if (!state?.gameOver) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="nes-container is-rounded is-dark w-full max-w-sm text-center">
        <h2 className="nes-text is-error text-xl">The island has fallen</h2>
        <p className="nes-text mt-4 text-xs leading-relaxed text-white/85">
          Pollution overwhelmed your settlement. You survived{" "}
          <span className="is-warning">{state.tick}</span> day
          {state.tick === 1 ? "" : "s"} with{" "}
          <span className="is-warning">{state.population}</span> people.
        </p>
        <button
          type="button"
          onClick={() => bus.emit("sim:restart")}
          className="nes-btn is-error mt-5 w-full text-sm"
        >
          Start a new island
        </button>
      </div>
    </div>
  );
}