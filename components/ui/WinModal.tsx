"use client";

import { bus } from "@/game/events/bus";
import { useGameBridge } from "@/components/ui/useGameBridge";

/**
 * Win overlay: shown only when the authoritative SimState reports the colony
 * survived TARGET_DAYS (state.won). Celebration readout (final population,
 * health) plus a Play again that restarts the run immediately.
 */
export function WinModal() {
  const { state } = useGameBridge();
  if (!state?.won) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-emerald-400/30 bg-slate-900 p-6 text-center shadow-2xl shadow-emerald-500/20">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300">
          Mission accomplished
        </p>
        <h2 className="mt-1 text-3xl font-black tracking-tight text-emerald-400">
          365 days survived
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/75">
          Your settlement took root on the island.{" "}
          <span className="font-bold text-white">{state.population}</span>{" "}
          people call it home, and the island&apos;s health settled at{" "}
          <span className="font-bold text-white">{state.health}</span>. The
          smoke has cleared — Solovra is yours.
        </p>
        <button
          type="button"
          onClick={() => bus.emit("sim:restart")}
          className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-400"
        >
          Play again
        </button>
      </div>
    </div>
  );
}