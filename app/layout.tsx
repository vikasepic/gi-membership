import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Inter as its variable font — every weight from one file. Pinned to 600 it
// had exactly one, so the page builder's Weight control changed a number and
// nothing on screen: Regular, Semibold and Bold all rendered as 600 because
// that was the only weight the browser had been given.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  // 700 for the same reason — the control offers Bold, so Bold has to exist.
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Greater Inside",
  description: "Store, library, and Content Engine — Greater Inside.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Greater Inside",
    // Translucent lets our own background run under the status bar, so the
    // top of the screen belongs to the app rather than to Safari.
    statusBarStyle: "black-translucent",
  },
};

// viewportFit: "cover" is what lets the layout reach into the notch and home
// indicator areas; without it iOS letterboxes the page and the safe-area
// insets below always read as 0.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAFAF8",
  // Tells the browser this document is light, so the parts IT paints — the
  // scrollbar, a select's dropdown, a date picker — come back light too. Without
  // it a visitor whose system is dark gets a light page with dark furniture in
  // the middle of it, which reads as broken rather than as themed.
  colorScheme: "light",
};

// Root: fonts, providers, html/body only. Chrome lives per route group —
// (store) uses AppShell; admin has its own layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} h-full`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
