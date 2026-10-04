import type { Metadata, Viewport } from "next";
import { Press_Start_2P } from "next/font/google";
// NES.css first so the project's globals.css (below) can override its reboot.
import "nes.css/css/nes.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polisland",
  description:
    "A survival island sim: extract resources, grow your settlement, and keep pollution from destroying the island.",
  icons: { icon: "/favicon.png" },
  robots: { index: false, follow: false },
};

// Tell mobile browsers the canvas should own the whole viewport (no URL bar
// rescale or zoom on the game area).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Press Start 2P is the pixel face behind every NES.css element. Self-hosted
// via next/font (no runtime Google dependency); the hashed family is exposed as
// --font-pixel and globals.css maps html/body to it.
const pixel = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-pixel",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={pixel.variable}>
      <body>{children}</body>
    </html>
  );
}