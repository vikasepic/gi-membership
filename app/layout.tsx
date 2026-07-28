import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["600"] });
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF8" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0D" },
  ],
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
