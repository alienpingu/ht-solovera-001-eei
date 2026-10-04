"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { BUILDING_DEFS } from "@/game/data/tiles";
import { bus } from "@/game/events/bus";

/**
 * Interactive tutorial (NES.css). A sequential queue of dialogue frames from
 * the robot mascot: each frame waits for a gameplay condition, then shows
 * until the player presses CONTINUE. Purely a React consumer of existing bus
 * events (sim:update / build:placed / sim:start / sim:restart / gameover / win)
 * — it never emits, so the Phaser boundary stays clean.
 *
 * Completion is remembered in localStorage so the tutorial plays once per
 * browser; clear `solovra:tutorial` to replay.
 */

const HOUSE_COST = BUILDING_DEFS.house.cost;
const FARM_COST = BUILDING_DEFS.monoculture_farm.cost;
const FACTORY_COST = BUILDING_DEFS.factory.cost;
const STORAGE_KEY = "solovra:tutorial";

interface TutorialCtx {
  money: number;
  foodProduced: number;
  foodConsumed: number;
  hasHouse: boolean;
}

interface TutorialFrame {
  avatar: "open" | "close";
  text: string;
  /** True when this frame's gameplay goal has been reached. */
  when: (ctx: TutorialCtx) => boolean;
}

const FRAMES: TutorialFrame[] = [
  {
    avatar: "open",
    text: "Welcome! Click on a tree to start harvesting wood and earning coins!",
    when: () => true,
  },
  {
    avatar: "close",
    text: `Great job! Now that you reached ${HOUSE_COST} coins, build a House on any free plot.`,
    when: (c) => c.money >= HOUSE_COST,
  },
  {
    avatar: "open",
    text: "Note: Each House consumes electricity and requires 1 Food per inhabitant to maintain productivity.",
    when: (c) => c.hasHouse,
  },
  {
    avatar: "close",
    text: "Keep chopping trees! Save up coins to purchase a Farm for food production.",
    when: () => true,
  },
  {
    avatar: "open",
    text: `You reached ${FARM_COST} coins! Buy a Farm now to secure your food supply.`,
    when: (c) => c.money >= FARM_COST,
  },
  {
    avatar: "close",
    text: `Chop more trees and build a Factory to start industrial production.`,
    when: (c) => c.money >= FACTORY_COST,
  },
  {
    avatar: "open",
    text: "Keep logging wood and ensure enough food supply so your workers don't starve!",
    when: (c) => c.foodProduced < c.foodConsumed,
  },
];

export function TutorialDialog() {
  // All mutable tutorial state lives in refs (the bus listeners need stable
  // closures); `force` just re-renders so the JSX reflects ref changes.
  const [, force] = useReducer((x: number) => x + 1, 0);
  const frameRef = useRef<number | null>(null);
  const shownRef = useRef(false);
  const doneRef = useRef(false);
  const hasHouseRef = useRef(false);
  const ctxRef = useRef({ money: 0, foodProduced: 0, foodConsumed: 0 });

  const ctx = (): TutorialCtx => ({
    ...ctxRef.current,
    hasHouse: hasHouseRef.current,
  });

  const evaluate = useCallback(() => {
    if (doneRef.current || frameRef.current === null) return;
    const f = FRAMES[frameRef.current];
    if (!f) return;
    if (f.when(ctx())) {
      if (!shownRef.current) {
        shownRef.current = true;
        force();
      }
    }
  }, []);

  const start = useCallback(() => {
    if (doneRef.current || frameRef.current !== null) return;
    frameRef.current = 0;
    shownRef.current = false;
    force();
    evaluate();
  }, [evaluate, force]);

  const advance = useCallback(() => {
    const next = (frameRef.current ?? 0) + 1;
    if (next >= FRAMES.length) {
      doneRef.current = true;
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* private mode / quota — just don't persist */
      }
      frameRef.current = null;
      shownRef.current = false;
      force();
      return;
    }
    frameRef.current = next;
    shownRef.current = false;
    force();
    evaluate();
  }, [evaluate, force]);

  const reset = useCallback(() => {
    if (doneRef.current) return;
    hasHouseRef.current = false;
    ctxRef.current = { money: 0, foodProduced: 0, foodConsumed: 0 };
    frameRef.current = null;
    shownRef.current = false;
    force();
    start();
  }, [start, force]);

  const hide = useCallback(() => {
    frameRef.current = null;
    shownRef.current = false;
    force();
  }, [force]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) {
      doneRef.current = true;
      return;
    }
    const offs = [
      bus.on("sim:update", (s) => {
        ctxRef.current = {
          money: s.money,
          foodProduced: s.foodProduced,
          foodConsumed: s.foodConsumed,
        };
        evaluate();
      }),
      bus.on("build:placed", ({ kind }) => {
        if (kind === "house") hasHouseRef.current = true;
        evaluate();
      }),
      bus.on("sim:start", start),
      bus.on("sim:restart", reset),
      bus.on("sim:gameover", hide),
      bus.on("sim:win", hide),
    ];
    return () => offs.forEach((off) => off());
  }, [evaluate, start, reset, hide]);

  const frame = frameRef.current;
  if (!shownRef.current || frame === null || doneRef.current) return null;
  const f = FRAMES[frame];
  const avatar = f.avatar === "open" ? "/avatar-open.png" : "/avatar-close.png";

  return (
    <div className="absolute inset-0 z-[25] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
      <div className="nes-container is-rounded is-dark w-full max-w-lg">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mascot sprite, no optimizer */}
          <img
            src={avatar}
            alt=""
            width={96}
            height={83}
            className="h-20 w-24 shrink-0 bg-black/30 object-contain"
            draggable={false}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="nes-text text-xs leading-relaxed text-white/90">{f.text}</p>
            <button
              type="button"
              onClick={advance}
              className="nes-btn is-primary mt-3 self-end text-xs"
            >
              CONTINUE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}