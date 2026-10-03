import type { SimState } from "@/game/engine/simulation";
import type { BuildingKind } from "@/game/data/tiles";

/**
 * Typed event bus bridging the Phaser world (60fps) and the React UI.
 * This is the ONLY channel of communication between them — React state is
 * never mutated from inside the Phaser update loop; instead scenes emit
 * discrete events (once per sim tick at most) and React re-renders on those.
 *
 * Events are declared as argument TUPLES ([payload]) rather than function
 * signatures. That keeps the whole emitter free of `any` while preserving
 * full type inference for on()/emit().
 *
 * Hand-rolled ~40 line emitter on purpose: no dependency, no observer-library
 * indirection.
 */

export interface BuildCellInfo {
  row: number;
  col: number;
  kind: BuildingKind;
}

export type GameEvents = {
  /** Phaser -> React: authoritative simulation state after one tick. */
  "sim:update": [state: SimState];
  /** Phaser -> React: the island died. */
  "sim:gameover": [state: SimState];
  /** React -> Phaser: user picked (or cleared) a building from the menu. */
  "build:select": [kind: BuildingKind | null];
  /** Phaser -> React: a building was placed (for toasts / logging). */
  "build:placed": [info: BuildCellInfo];
  /** Phaser -> React: a building was demolished. */
  "build:removed": [info: { row: number; col: number }];
  /** Phaser -> React: a soft error worth showing to the player. */
  "ui:error": [message: string];
  /** React -> Phaser: restart the run with a fresh island. */
  "sim:restart": [];
};

export class EventBus<Events extends Record<string, unknown[]>> {
  private listeners: { [K in keyof Events]?: ((...args: Events[K]) => void)[] } = {};

  /** Register a listener; returns an unsubscribe closure for easy cleanup. */
  on<K extends keyof Events>(event: K, fn: (...args: Events[K]) => void): () => void {
    const list = (this.listeners[event] ??= [] as ((...args: Events[K]) => void)[]);
    list.push(fn);
    return () => this.off(event, fn);
  }

  once<K extends keyof Events>(event: K, fn: (...args: Events[K]) => void): () => void {
    const wrapper = (...args: Events[K]) => {
      this.off(event, wrapper);
      fn(...args);
    };
    return this.on(event, wrapper);
  }

  off<K extends keyof Events>(event: K, fn: (...args: Events[K]) => void): void {
    const list = this.listeners[event];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const list = this.listeners[event];
    if (!list) return;
    // Copy before dispatch: a listener may unsubscribe itself mid-loop.
    for (const fn of [...list]) fn(...args);
  }
}

/** Application-wide singleton — both Phaser scenes and React import this. */
export const bus = new EventBus<GameEvents>();