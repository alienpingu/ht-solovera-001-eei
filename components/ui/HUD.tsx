"use client";

import { useGameBridge } from "@/components/ui/useGameBridge";

/**
 * Top status bar: live resource readout (money / population / day) plus the
 * two survival bars (health / pollution). Icons are inline SVG so there are no
 * image assets to load and they stay crisp at any DPI. Text is white on a
 * solid dark panel with a drop shadow so it survives bright outdoor screens.
 * Values update only when the sim emits (1 tick per second max).
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
    <span className="flex items-center gap-1.5" aria-label={label}>
      {icon}
      <span className={`text-sm font-bold tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] ${className}`}>
        {value}
      </span>
    </span>
  );
}

export function HUD() {
  const { state, toast } = useGameBridge();

  const health = state?.health ?? 100;
  const pollution = state?.pollution ?? 0;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 select-none p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-xl flex-col gap-2">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-black/65 px-4 py-2 shadow-lg backdrop-blur-sm">
          <Stat icon={<CoinIcon />} value={`$${state?.money ?? "–"}`} label="Money" className="text-emerald-300" />
          <Stat icon={<PeopleIcon />} value={state?.population ?? 0} label="Population" className="text-sky-300" />
          <Stat icon={<SunIcon />} value={`Day ${state?.tick ?? 0}`} label="Day" className="text-amber-200" />
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl bg-black/55 px-3 py-2 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] font-bold uppercase tracking-wide text-emerald-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Health
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  health > 60 ? "bg-emerald-400" : health > 30 ? "bg-amber-400" : "bg-red-500"
                }`}
                style={{ width: `${health}%` }}
              />
            </div>
            <span className="w-8 text-right text-xs font-bold tabular-nums text-emerald-200">
              {health}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] font-bold uppercase tracking-wide text-red-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
              Pollution
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-red-400 transition-all duration-500"
                style={{ width: `${pollution}%` }}
              />
            </div>
            <span className="w-8 text-right text-xs font-bold tabular-nums text-red-200">
              {pollution}
            </span>
          </div>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-auto mx-auto mt-2 max-w-xl rounded-md bg-red-600/95 px-3 py-1.5 text-center text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
