import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { themeInitScript } from "@/components/theme-toggle";

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
  themeColor: "#FAFAF8",
};

// Root: fonts, providers, html/body only. Chrome lives per route group —
// (store) uses AppShell; admin has its own layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} h-full`}>
      <head>
        {/* Applies a saved dark preference before first paint, so a returning
            reader never sees a white flash. Must be inline and synchronous. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
