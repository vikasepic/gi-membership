import Link from "next/link";
import { headers } from "next/headers";
import { redirect, permanentRedirect } from "next/navigation";
import { getSettingsOrDefaults } from "@/lib/settings";
import { matchRedirect } from "@/lib/redirects";

// Next renders this for any unmatched URL and for notFound() calls, including
// ones outside the (store) route group — so it can't rely on AppShell being
// present and brings its own centring.
//
// It is also where the store's redirects are honoured, and this is the cheapest
// possible place for them: a redirect only matters once the router has decided
// there is nothing here, so a page that exists never pays for the lookup. Doing
// it in middleware would cost a settings read on every request to every working
// page, to answer a question almost always answered "no".
//
// The path comes from the header the middleware already sets — a page cannot
// read the URL any other way.
export default async function NotFound() {
  await sendAnywhereItShould();

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

/**
 * Follow a redirect rule for this path, if the store has one.
 *
 * Never throws. A settings row that cannot be read must cost a 404 page its
 * redirects, not its ability to render — and the 404 page is the last thing
 * standing between a bad link and a stack trace.
 *
 * `redirect` throws by design in Next, which is how it stops rendering; so the
 * try/catch has to re-throw it rather than swallow it, or every redirect would
 * be quietly turned back into a 404.
 */
async function sendAnywhereItShould(): Promise<void> {
  let rule: { to: string; permanent: boolean } | null = null;
  try {
    const path = (await headers()).get("x-pathname");
    if (!path) return;
    const settings = await getSettingsOrDefaults();
    rule = matchRedirect(settings.redirects, path);
  } catch {
    return;
  }
  if (!rule) return;
  // Outside the try: these throw to interrupt rendering, and catching that
  // would turn a working redirect into a 404 page.
  if (rule.permanent) permanentRedirect(rule.to);
  redirect(rule.to);
}
