"use client";

import { BUILDING_DEFS, BUILDING_ORDER } from "@/game/data/tiles";
import type { BuildingKind } from "@/game/data/tiles";
import { bus } from "@/game/events/bus";
import { useGameBridge } from "@/components/ui/useGameBridge";

/**
 * Bottom action bar (NES.css). Tapping a button selects a building kind (a
 * ghost preview appears on the island); tapping it again deselects and returns
 * to demolish-mode. Each button shows the model's preview PNG plus a short
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
      className="h-9 w-9 bg-black/40 object-contain"
      draggable={false}
    />
  );
}

export function BuildingMenu({ suggested }: { suggested: BuildingKind | null }) {
  const { state, selected } = useGameBridge();

  const pick = (kind: BuildingKind) => {
    bus.emit("build:select", selected === kind ? null : kind);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-[max(0.2rem,env(safe-area-inset-bottom))]">
      <div className="is-rounded is-dark hud-panel pointer-events-auto m-0 max-w-xl">
        <div className="grid grid-cols-3 m-0 p-0">
          {BUILDING_ORDER.map((kind) => {
            const def = BUILDING_DEFS[kind];
            const affordable = state !== null && state.money >= def.cost;
            const active = selected === kind;
const cls = active
              ? "is-primary"
              : affordable
                ? ""
                : "is-disabled";
            return (
              <button
                key={kind}
                type="button"
                onClick={() => pick(kind)}
                aria-pressed={active}
                aria-label={`${def.label}: ${def.desc}. Cost $${def.cost}`}
                title={def.desc}
                className={`nes-btn build-btn w-full text-[10px] ${cls} ${suggested === kind ? "is-suggested" : ""}`}
              >
                <BuildingIcon kind={kind} />
                <span>{def.label}</span>
                <span>${def.cost}</span>
              </button>
            );
          })}
        </div>
        {/* <p className="nes-text mt-2 text-center text-[10px] text-white/85">
          {selected
            ? "Click/tap or drag a tile to build — select again to cancel"
            : "Select a building, or click/tap a building to demolish it"}
        </p> */}
      </div>
    </div>
  );
}