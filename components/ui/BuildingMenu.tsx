"use client";

import { BUILDING_DEFS, BUILDING_ORDER } from "@/game/data/tiles";
import type { BuildingKind } from "@/game/data/tiles";
import { bus } from "@/game/events/bus";
import { useGameBridge } from "@/components/ui/useGameBridge";

/**
 * Bottom action bar. Tapping a button selects a building kind (a ghost preview
 * appears on the island); tapping it again deselects and returns to
 * demolish-mode. Buttons are icon + short label and guaranteed >=48px tall /
 * >=48px wide for comfortable thumb targets. The longer effect description
 * lives in the aria-label + title instead of cluttering the button face.
 */

function BuildingIcon({ kind }: { kind: BuildingKind }) {
  if (kind === "extractor") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M12 2.5l2.4 1.4v2.8L12 8.1 9.6 6.7V3.9z" fill="#fca5a5" stroke="#991b1b" strokeWidth="1.2" />
        <circle cx="12" cy="13" r="3" fill="#cbd5e1" stroke="#475569" strokeWidth="1.4" />
        <g stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
          <path d="M12 8.5v1.2M12 16.3v1.2M7.5 13h1.2M15.3 13h1.2M8.8 9.8l.9.9M14.3 14.3l.9.9M15.2 9.8l-.9.9M9.7 14.3l-.9.9" />
        </g>
      </svg>
    );
  }
  if (kind === "house") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M12 3.5L21 11h-2.5v9h-13v-9H3z" fill="#93c5fd" stroke="#1e40af" strokeWidth="1.4" strokeLinejoin="round" />
        <rect x="10" y="14" width="4" height="6" fill="#1e3a8a" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect x="10.5" y="14" width="3" height="7" fill="#92400e" />
      <circle cx="12" cy="9" r="5.5" fill="#4ade80" stroke="#166534" strokeWidth="1.4" />
      <circle cx="9.5" cy="8" r="1.6" fill="#22c55e" />
    </svg>
  );
}

export function BuildingMenu() {
  const { state, selected } = useGameBridge();

  const pick = (kind: BuildingKind) => {
    bus.emit("build:select", selected === kind ? null : kind);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-xl rounded-2xl bg-black/65 p-3 shadow-lg backdrop-blur-sm">
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
            ? "Tap or drag on a tile to build — tap the button again to cancel"
            : "Select a building, or tap a building to demolish it"}
        </p>
      </div>
    </div>
  );
}
