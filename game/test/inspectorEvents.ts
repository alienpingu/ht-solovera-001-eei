/**
 * Local channel for the /test tile inspector. Deliberately separate from the
 * game's `bus`: the inspector is a throwaway tool and must not add events to
 * the typed game event map (or the two would drift). Phaser -> React only.
 */
export interface TilePick {
  /** Atlas texture key: "landscape" | "buildings". */
  sheet: string;
  /** Frame name inside the atlas, e.g. "landscapeTiles_044.png". */
  frame: string;
  row: number;
  col: number;
  /** Flat index in the spawned list. */
  index: number;
  total: number;
}

type Listener = (tile: TilePick) => void;

const listeners = new Set<Listener>();

export const inspectorEvents = {
  onTile(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  emitTile(tile: TilePick): void {
    for (const fn of [...listeners]) fn(tile);
  },
};
