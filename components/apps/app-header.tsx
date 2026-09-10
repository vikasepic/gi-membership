import Link from "next/link";
import { Logo } from "@/components/logo";
import type { BuiltinApp } from "@/lib/builtin-apps/registry";

/**
 * The top bar of a built-in app: the store's mark, the app's name, and the
 * two places a member goes from here. Hidden in print, where only the
 * document should be on the page.
 */
export function BuiltinAppHeader({ app, wide = false }: { app: BuiltinApp; wide?: boolean }) {
  return (
    <header className="print-hide border-b border-border bg-surface">
      <nav
        className={`mx-auto flex w-full items-center justify-between gap-4 px-5 py-3 ${
          wide ? "max-w-[1400px]" : "max-w-6xl"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="Greater Inside" className="shrink-0 text-fg">
            <Logo className="h-7 w-auto" />
          </Link>
          <span aria-hidden className="text-border">
            /
          </span>
          <Link
            href={app.route}
            className="min-w-0 truncate font-display text-sm font-semibold text-navy sm:text-base"
          >
            {app.name}
          </Link>
        </div>
        {/* On a phone the two labels left the app's own name 106px — it read
            "Micro-Prod…". Account is one tap away inside the library, so it
            stays off the bar until there is room for both. */}
        <div className="flex shrink-0 items-center gap-3 text-sm sm:gap-4">
          <Link href="/library" className="text-muted transition-colors hover:text-fg">
            Library
          </Link>
          <Link href="/account" className="hidden text-muted transition-colors hover:text-fg sm:inline">
            Account
          </Link>
        </div>
      </nav>
    </header>
  );
}
