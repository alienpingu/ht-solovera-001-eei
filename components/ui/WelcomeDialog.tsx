"use client";

import { BUILDING_DEFS, BUILDING_ORDER } from "@/game/data/tiles";
import type { BuildingKind } from "@/game/data/tiles";
import { bus } from "@/game/events/bus";

/**
 * Welcome / story dialog shown right after the start menu, still on a paused
 * island. Tells the crash-landing story and teaches the one mechanic that
 * matters — balance factories, houses and trees so pollution never hits 100
 * before day 365. "Begin colonization" emits sim:start, which finally starts
 * the ticking sim.
 */
function MechanicCard({ kind }: { kind: BuildingKind }) {
  const def = BUILDING_DEFS[kind];
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left">
      {/* eslint-disable-next-line @next/next/no-img-element -- static CC0 preview */}
      <img
        src={def.model.preview}
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 shrink-0 rounded-md bg-black/40 object-contain"
        draggable={false}
      />
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wide text-white">
          {def.label}
        </p>
        <p className="text-[11px] font-semibold leading-snug text-white/70">
          {def.desc}
        </p>
      </div>
    </div>
  );
}

export function WelcomeDialog({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-sky-300">
            Transmission received
          </h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-white/85">
            Your rocket came apart over an uncharted island. You are the last
            human awake in the wreck — and the only one who can manage this
            colony. No rescue is coming. Build a society that can outlast the
            smoke and the sea.
          </p>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300/90">
            How the colony works
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {BUILDING_ORDER.map((kind) => (
              <MechanicCard key={kind} kind={kind} />
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold leading-relaxed text-white/70">
            Pollution fills each day; at 100 it kills the island (health = 100
            − pollution). Trees cancel out factories. Tap a placed building to
            demolish it and refund half its cost.
          </p>
        </div>

        <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-center text-sm font-black text-emerald-300 ring-1 ring-emerald-400/30">
          Goal: keep the colony alive for 365 days
        </p>

        <button
          type="button"
          onClick={() => {
            bus.emit("sim:start");
            onBegin();
          }}
          className="w-full rounded-2xl bg-emerald-500 px-6 py-4 text-base font-black tracking-wide text-white shadow-lg shadow-emerald-500/25 transition-colors hover:bg-emerald-400 active:bg-emerald-600"
        >
          Begin colonization
        </button>
      </div>
    </div>
  );
}