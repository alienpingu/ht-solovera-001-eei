import GameView from "@/components/GameView";

/**
 * Mobile-first shell. The full viewport is the game; HUD/menu/modal live
 * inside GameView as absolutely-positioned overlays over the Phaser canvas.
 */
export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0d1f3c] text-white">
      <GameView />
    </main>
  );
}