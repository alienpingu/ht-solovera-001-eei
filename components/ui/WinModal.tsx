"use client";

import { bus } from "@/game/events/bus";
import { useGameBridge } from "@/components/ui/useGameBridge";

/**
 * Win overlay (NES.css): shown only when the authoritative SimState reports the
 * colony survived TARGET_DAYS (state.won). Celebration readout (final
 * population, health) plus a Play again that restarts the run immediately.
 */
export function WinModal() {
  const { state } = useGameBridge();
  if (!state?.won) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="nes-container is-rounded is-dark w-full max-w-sm text-center">
        <p className="nes-text is-warning text-[10px] tracking-widest">
          Mission accomplished
        </p>
        <h2 className="nes-text is-success mt-2 text-xl">365 days survived</h2>
        <p className="nes-text mt-4 text-xs leading-relaxed text-white/85">
          Your settlement took root on the island.{" "}
          <span className="is-warning">{state.population}</span> people call it
          home, and the island&apos;s health settled at{" "}
          <span className="is-warning">{state.health}</span>. The smoke has
          cleared — Solovra is yours.
        </p>
        <button
          type="button"
          onClick={() => bus.emit("sim:restart")}
          className="nes-btn is-success mt-5 w-full text-sm"
        >
          Play again
        </button>
      </div>
    </div>
  );
}