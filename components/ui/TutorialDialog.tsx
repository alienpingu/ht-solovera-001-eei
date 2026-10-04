"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { BUILDING_DEFS } from "@/game/data/tiles";
import type { BuildingKind } from "@/game/data/tiles";
import { bus } from "@/game/events/bus";

/**
 * Interactive tutorial (NES.css). A sequential queue of dialogue frames from
 * the robot mascot: each frame waits for a gameplay condition, then shows
 * until the player presses CONTINUE. While a frame is on screen it freezes the
 * day counter via sim:pause/sim:resume so reading never burns game time.
 *
 * Action frames can also `suggest` a building (highlighting its menu button)
 * so the player knows which button to press.
 *
 * Purely a React consumer of existing bus events; the only things it emits are
 * sim:pause / sim:resume. Completion is remembered in localStorage so the
 * tutorial plays once per browser; clear `pollisland:tutorial` to replay.
 */

const HOUSE_COST = BUILDING_DEFS.house.cost;
const FARM_COST = BUILDING_DEFS.monoculture_farm.cost;
const COAL_COST = BUILDING_DEFS.coal_plant.cost;
const STORAGE_KEY = "pollisland:tutorial";

interface TutorialCtx {
  money: number;
  foodProduced: number;
  foodConsumed: number;
  hasHouse: boolean;
  hasCoal: boolean;
  hasFarm: boolean;
  hasFactory: boolean;
}

interface TutorialFrame {
  avatar: "open" | "close";
  text: string;
  /** True when this frame's gameplay goal has been reached. */
  when: (ctx: TutorialCtx) => boolean;
  /** Building whose menu button should be highlighted while this frame shows. */
  suggest?: BuildingKind;
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
    suggest: "house",
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
    suggest: "monoculture_farm",
  },
  {
    avatar: "close",
    text: `Your house and farm need electricity! Save up ${COAL_COST} coins and build a Coal Plant.`,
    when: (c) => c.hasHouse && c.hasFarm,
    suggest: "coal_plant",
  },
  {
    avatar: "close",
    text: `Chop more trees and build a Factory to start industrial production.`,
    when: (c) => c.hasCoal,
    suggest: "factory",
  },
  {
    avatar: "open",
    text: "It's all in your hands now — keep an eye on pollution and health, and reach day 365!",
    when: (c) => c.hasFactory,
  },
];

export function TutorialDialog({
  onSuggestion,
}: {
  onSuggestion: (kind: BuildingKind | null) => void;
}) {
  // All mutable tutorial state lives in refs (the bus listeners need stable
  // closures); `force` just re-renders so the JSX reflects ref changes.
  const [, force] = useReducer((x: number) => x + 1, 0);
  const frameRef = useRef<number | null>(null);
  const shownRef = useRef(false);
  const pausedRef = useRef(false);
  const doneRef = useRef(false);
  // Sticky highlight: once a frame suggests a building, the menu button keeps
  // its border until the player actually clicks it (or the tutorial ends).
  const suggestedRef = useRef<BuildingKind | null>(null);
  const hasHouseRef = useRef(false);
  const hasCoalRef = useRef(false);
  const hasFarmRef = useRef(false);
  const hasFactoryRef = useRef(false);
  const ctxRef = useRef({ money: 0, foodProduced: 0, foodConsumed: 0 });

  const ctx = (): TutorialCtx => ({
    ...ctxRef.current,
    hasHouse: hasHouseRef.current,
    hasCoal: hasCoalRef.current,
    hasFarm: hasFarmRef.current,
    hasFactory: hasFactoryRef.current,
  });

  /** Highlight whatever the current on-screen frame suggests (or keep the previous suggestion). */
  const pushSuggestion = useCallback(() => {
    const f = shownRef.current && frameRef.current !== null ? FRAMES[frameRef.current] : null;
    const next = f?.suggest ?? suggestedRef.current;
    if (next !== suggestedRef.current) {
      suggestedRef.current = next;
      onSuggestion(next);
    }
  }, [onSuggestion]);

  const clearSuggestion = useCallback(() => {
    if (suggestedRef.current === null) return;
    suggestedRef.current = null;
    onSuggestion(null);
  }, [onSuggestion]);

  const pauseSim = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    bus.emit("sim:pause");
  }, []);

  const resumeSim = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    bus.emit("sim:resume");
  }, []);

  const evaluate = useCallback(() => {
    if (doneRef.current || frameRef.current === null) return;
    const f = FRAMES[frameRef.current];
    if (!f) return;
    if (f.when(ctx())) {
      if (!shownRef.current) {
        shownRef.current = true;
        pauseSim();
        pushSuggestion();
        force();
      }
      // Re-render whenever a condition changes so a locked CONTINUE unlocks
      // live (the coal step's money goal). sim:update fires ≤1/s, so this is
      // cheap while a frame is up.
      force();
    }
  }, [pauseSim, pushSuggestion, force]);

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
      resumeSim();
      clearSuggestion();
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
    resumeSim();
    // Don't clear the suggestion here: the border stays on the hinted button
    // until the player clicks it, even as frames advance. A new frame with its
    // own `suggest` replaces it via evaluate() -> pushSuggestion().
    frameRef.current = next;
    shownRef.current = false;
    force();
    evaluate();
  }, [evaluate, resumeSim, clearSuggestion, force]);

  const reset = useCallback(() => {
    if (doneRef.current) return;
    resumeSim();
    clearSuggestion();
    hasHouseRef.current = false;
    hasCoalRef.current = false;
    hasFarmRef.current = false;
    hasFactoryRef.current = false;
    ctxRef.current = { money: 0, foodProduced: 0, foodConsumed: 0 };
    frameRef.current = null;
    shownRef.current = false;
    force();
    start();
  }, [start, resumeSim, clearSuggestion, force]);

  const hide = useCallback(() => {
    resumeSim();
    clearSuggestion();
    frameRef.current = null;
    shownRef.current = false;
    force();
  }, [resumeSim, clearSuggestion, force]);

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
        if (kind === "coal_plant") hasCoalRef.current = true;
        if (kind === "monoculture_farm") hasFarmRef.current = true;
        if (kind === "factory") hasFactoryRef.current = true;
        evaluate();
      }),
      // The hint's job is done once the player actually clicks the button it
      // points at (menu tap or a 1..6 hotkey both fire build:select).
      bus.on("build:select", (kind) => {
        if (kind !== null && kind === suggestedRef.current) clearSuggestion();
      }),
      bus.on("sim:start", start),
      bus.on("sim:restart", reset),
      bus.on("sim:gameover", hide),
      bus.on("sim:win", hide),
    ];
    return () => {
      offs.forEach((off) => off());
      // Don't leave the day counter frozen if the component unmounts mid-step.
      resumeSim();
    };
  }, [evaluate, start, reset, hide, resumeSim, clearSuggestion]);

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