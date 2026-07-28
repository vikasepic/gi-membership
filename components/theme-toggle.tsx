"use client";

import { useEffect, useState } from "react";

// Light is the default. Dark is a choice the reader makes and we remember —
// we deliberately don't follow the OS, because the store should look the way
// it was designed unless someone asks otherwise.
export type Theme = "light" | "dark";
export const THEME_KEY = "gi_theme";

// Runs before first paint (see the root layout) so a returning dark-mode reader
// never sees a white flash. Kept as a string because it must be inlined.
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode — the choice just won't persist */
  }
  // Keep the phone's status/browser bar in step with the app.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0B0B0D" : "#FAFAF8");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem(THEME_KEY);
      } catch {
        return null;
      }
    })();
    setTheme(stored === "dark" ? "dark" : "light");
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex gap-1 rounded-full border border-border bg-surface-2 p-1"
    >
      {(["light", "dark"] as const).map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          onClick={() => choose(t)}
          className={`flex-1 rounded-full px-4 py-2 text-sm capitalize transition-colors ${
            theme === t ? "bg-surface text-fg shadow-sm" : "text-muted"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
