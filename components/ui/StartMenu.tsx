"use client";

/**
 * Title screen. Rendered before a run begins: the island shows through a
 * semi-transparent backdrop (the sim is paused at Day 0 behind it) and the
 * only action is starting the mission, which opens the welcome/story dialog.
 * The look reuses the game's dark-slate + emerald/sky palette so the menu
 * reads as part of the game rather than a foreign web page.
 */
export function StartMenu({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-6 backdrop-blur-[2px]">
      <div className="w-full max-w-md text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-sky-300/90">
          Uncharted sector · planetfall
        </p>
        <h1 className="mt-2 text-5xl font-black tracking-tight text-white drop-shadow-[0_2px_12px_rgba(56,189,248,0.35)]">
          SOLOVRA
        </h1>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-white/80">
          A sci-fi society simulator. Crash-landed on an uncharted island, you
          must balance industry and nature to keep a settlement alive.
        </p>

        <button
          type="button"
          onClick={onStart}
          className="mt-8 w-full rounded-2xl bg-emerald-500 px-6 py-4 text-base font-black tracking-wide text-white shadow-lg shadow-emerald-500/25 transition-colors hover:bg-emerald-400 active:bg-emerald-600"
        >
          Start mission
        </button>

        <p className="mt-4 text-[11px] font-medium text-white/45">
          Survive 365 days · factories &amp; houses pay · trees clean
        </p>
      </div>
    </div>
  );
}