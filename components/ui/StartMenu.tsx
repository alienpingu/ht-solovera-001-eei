"use client";

import { useState } from "react";

/**
 * Minimal title screen. The island shows through a translucent backdrop (the
 * sim is paused at Day 0 behind it) and the only action is starting the
 * mission. Every element is NES.css — the retro chrome is the game's shell,
 * and the interactive tutorial will hang off the same foundation later.
 */
export function StartMenu({ onStart }: { onStart: () => void }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-6 backdrop-blur-[2px]">
      <div className="nes-container is-rounded is-dark w-full max-w-md text-center">
        <p className="nes-text is-warning text-[10px] tracking-widest">
          Uncharted sector · planetfall
        </p>
        <h1 className="mt-4 text-xl font-black tracking-[0.12em] text-white drop-shadow-[0_2px_12px_rgba(56,189,248,0.35)] sm:text-2xl">
          POLLISLAND
        </h1>
        <p className="mt-4 text-xs leading-relaxed text-white/85">
          Crash-landed on an uncharted island, you must balance industry and
          nature to keep a settlement alive.
        </p>

        <button
          type="button"
          onClick={onStart}
          className="nes-btn is-success mt-6 w-full text-sm"
        >
          START MISSION
        </button>

        <button
          type="button"
          onClick={() => setAboutOpen((v) => !v)}
          className="nes-btn mt-2 w-full text-sm"
        >
          {aboutOpen ? "CLOSE" : "ABOUT"}
        </button>

        {aboutOpen && (
          <div className="nes-container is-dark mt-4 border-0 bg-black/30 text-left">
            <p className="nes-text text-xs leading-relaxed text-white/85">
              PollIsland was built in{" "}
              <span className="is-warning">24 hours</span> during the Solovera
              Hackathon.
            </p>
            <a
              href="https://hackaton.solovera.work/"
              target="_blank"
              rel="noopener noreferrer"
              className="nes-text is-primary mt-2 inline-block text-xs underline"
            >
              hackaton.solovera.work
            </a>
          </div>
        )}

        <p className="mt-4 text-[10px] text-white/55">
          Survive 365 days · cut trees to bootstrap your colony
        </p>
      </div>
    </div>
  );
}