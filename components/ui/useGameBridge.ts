"use client";

import { useEffect, useState } from "react";
import { bus } from "@/game/events/bus";
import type { SimState } from "@/game/engine/simulation";
import type { BuildingKind } from "@/game/data/tiles";

/**
 * React-side subscription to the Phaser event bus. The ONLY way UI state is
 * updated: discrete bus events, never per-frame. `state` is null until the
 * MainScene emits the initial snapshot.
 */
export function useGameBridge() {
  const [state, setState] = useState<SimState | null>(null);
  const [selected, setSelected] = useState<BuildingKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const offUpdate = bus.on("sim:update", setState);
    const offSelect = bus.on("build:select", setSelected);
    const offError = bus.on("ui:error", setToast);
    return () => {
      offUpdate();
      offSelect();
      offError();
    };
  }, []);

  // Auto-dismiss error toasts so a stale error doesn't sit on screen forever.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  return { state, selected, toast };
}