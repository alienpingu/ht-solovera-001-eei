import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solovra — Island Survival",
  description:
    "A survival island sim: extract resources, grow your settlement, and keep pollution from destroying the island.",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}