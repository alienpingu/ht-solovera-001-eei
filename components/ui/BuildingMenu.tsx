"use client";

import { BUILDING_DEFS, BUILDING_ORDER } from "@/game/data/tiles";
import type { BuildingKind } from "@/game/data/tiles";
import { bus } from "@/game/events/bus";
import { useGameBridge } from "@/components/ui/useGameBridge";

/**
 * Bottom action bar. Tapping a button selects a building kind (a ghost preview
 * appears on the island); tapping it again deselects and returns to
 * demolish-mode. Each button shows the model's 64x64 preview PNG plus a short
 * label, and is guaranteed >=48px tall / >=48px wide for comfortable thumb
 * targets. The longer effect description lives in the aria-label + title
 * instead of cluttering the button face.
 */

function BuildingIcon({ kind }: { kind: BuildingKind }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static CC0 preview, no optimizer needed
    <img
      src={BUILDING_DEFS[kind].model.preview}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 rounded-md bg-black/40 object-contain"
      draggable={false}
    />
  );
}

export function BuildingMenu() {
  const { state, selected } = useGameBridge();

  const pick = (kind: BuildingKind) => {
    bus.emit("build:select", selected === kind ? null : kind);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl bg-black/65 p-3 shadow-lg backdrop-blur-sm">
        <div className="grid grid-cols-3 gap-3">
          {BUILDING_ORDER.map((kind) => {
            const def = BUILDING_DEFS[kind];
            const affordable = state !== null && state.money >= def.cost;
            const active = selected === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => pick(kind)}
                aria-pressed={active}
                aria-label={`${def.label}: ${def.desc}. Cost $${def.cost}`}
                title={def.desc}
                className={`flex min-h-14 min-w-12 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 transition-colors ${
                  active
                    ? "bg-emerald-500 text-white shadow-inner ring-2 ring-emerald-300"
                    : affordable
                      ? "bg-white/10 text-white hover:bg-white/20 active:bg-white/25"
                      : "bg-white/5 text-white/40"
                }`}
              >
                <BuildingIcon kind={kind} />
                <span className="text-xs font-bold leading-none">{def.label}</span>
                <span className="text-[11px] font-semibold leading-none opacity-90">
                  ${def.cost}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 rounded-lg bg-black/50 px-2 py-1.5 text-center text-[11px] font-semibold text-white/85 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          {selected
            ? "Click/tap or drag a tile to build — select again to cancel"
            : "Select a building, or click/tap a building to demolish it"}
        </p>
      </div>
    </div>
  );
}
