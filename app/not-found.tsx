import Link from "next/link";

// Next renders this for any unmatched URL and for notFound() calls, including
// ones outside the (store) route group — so it can't rely on AppShell being
// present and brings its own centring.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="kicker text-muted">404</span>
      <h1 className="text-3xl leading-tight md:text-4xl text-balance">
        That page doesn&rsquo;t exist.
      </h1>
      <p className="text-muted text-pretty">
        The link may be old, or the product may have been renamed. Everything you own is still in
        your library.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Link
          href="/"
          className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Browse the store
        </Link>
        <Link
          href="/library"
          className="rounded-full border border-border px-6 py-3 font-medium transition-colors hover:border-primary"
        >
          Your library
        </Link>
      </div>
    </main>
  );
}
