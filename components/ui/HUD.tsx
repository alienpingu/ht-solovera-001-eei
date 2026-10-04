"use client";

import { useGameBridge } from "@/components/ui/useGameBridge";

/**
 * Top status bar: live resource readout (money / population / day) plus the
 * two survival bars (health / pollution) and the power/food net. Icons are
 * inline SVG (no image assets, crisp at any DPI). Every panel is NES.css —
 * retro pixel chrome over the game canvas. Values update only when the sim
 * emits (1 tick per second max).
 */

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#fbbf24" stroke="#b45309" strokeWidth="2" />
      <path d="M12 7v10M9.5 9.2h3.6a1.8 1.8 0 0 1 0 3.6H9.5m0 0h4" fill="none" stroke="#78350f" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" fill="#7dd3fc" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" fill="#7dd3fc" />
      <circle cx="17" cy="9.5" r="2.4" fill="#38bdf8" />
      <path d="M13.5 18.5a4.2 4.2 0 0 1 7 0" fill="#38bdf8" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="#fde047" />
      <g stroke="#facc15" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
      </g>
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M13 2 4.5 13.5h5L11 22l8.5-11.5h-5L13 2z" fill="#fde047" stroke="#a16207" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function WheatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M12 22V9M12 9c-2.5-1-4-3-3.5-5.5C11 3 12 5 12 6.5 12 5 13 3 15.5 3.5 16 6 14.5 8 12 9z" fill="#fbbf24" stroke="#b45309" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 15c-2.2-.8-3.5-2.6-3-4.6 2.5-.4 3.5 1.5 3 2.8.5-1.3 1.5-3.2 4-2.8.5 2-0.8 3.8-3 4.6z" fill="#fbbf24" stroke="#b45309" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({
  icon,
  value,
  label,
  className,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  className: string;
}) {
  return (
    <span className="nes-text flex items-center gap-1.5" aria-label={label}>
      {icon}
      <span className={`text-xs ${className}`}>{value}</span>
    </span>
  );
}

export function HUD() {
  const { state, toast } = useGameBridge();

  const health = state?.health ?? 100;
  const pollution = state?.pollution ?? 0;
  const powerNet = (state?.powerProduced ?? 0) - (state?.powerConsumed ?? 0);
  const foodNet = (state?.foodProduced ?? 0) - (state?.foodConsumed ?? 0);
  const powerShort = state !== null && powerNet < 0;
  const foodShort = state !== null && foodNet < 0;
  const pop = state?.population ?? 0;
  const cap = state?.housingCapacity ?? 0;
  const healthVariant = health > 60 ? "is-success" : health > 30 ? "is-warning" : "is-error";

  return (
    <>
    <div id='top-hud-box' className="pointer-events-none absolute inset-x-0 top-0 z-20 select-none p-2 pt-[max(0.75rem,env(safe-area-inset-top))] nes-container is-rounded is-dark hud-panel mx-auto p-0">
      <div className="mx-auto flex max-w-xl flex-col gap-2 ">
        <div className="">
          <div className="flex items-center justify-between gap-3">
            <Stat icon={<CoinIcon />} value={`$${state?.money ?? "–"}`} label="Money" className="is-success" />
            <Stat icon={<SunIcon />} value={`Day ${state?.tick ?? 0}`} label="Day" className="is-warning" />
          </div>
        </div>
        <div className="">
          <div className="flex items-center justify-between gap-3">
            <Stat
              icon={<BoltIcon />}
              value={`${powerNet < 0 ? "" : "+"}${powerNet}`}
              label="Power"
              className={powerShort ? "is-error" : "is-warning"}
            />
            <Stat icon={<PeopleIcon />} value={cap > 0 ? `${pop} / ${cap}` : pop} label="Population" className="is-primary" />
            <Stat
              icon={<WheatIcon />}
              value={`${foodNet < 0 ? "" : "+"}${foodNet}`}
              label="Food"
              className={foodShort ? "is-error" : "is-warning"}
            />
          </div>
        </div>
        <div className="">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="nes-text is-success w-12 text-[10px]">Health</span>
              <progress className={`nes-progress hud-bar ${healthVariant}`} value={health} max={100} />
              <span className="nes-text is-success w-8 text-right text-xs">{health}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="nes-text is-error w-12 text-[10px]">Pollu.</span>
              <progress className="nes-progress is-error hud-bar" value={pollution} max={100} />
              <span className="nes-text is-error w-8 text-right text-xs">{pollution}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  {toast && (
        <div className="nes-container is-rounded is-dark pointer-events-auto mx-auto mt-2 max-w-xl py-2 text-center">
          <span className="nes-text is-error text-xs">{toast}</span>
        </div>
      )}
  </>  
  );
}