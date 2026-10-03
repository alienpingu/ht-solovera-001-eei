import TestGameView from "@/components/test/TestGameView";

/**
 * Debug route: spawns every frame from the Kenney landscape + buildings
 * atlases on an iso grid so tiles can be inspected and picked by id. Not
 * linked from the game and excluded from indexing by the root metadata.
 */
export default function TestPage() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0b1220] text-white">
      <TestGameView />
    </main>
  );
}
