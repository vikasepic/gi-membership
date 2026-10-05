import Link from "next/link";
import type { LibraryApp } from "@/lib/library";
import { ChannelBadge } from "@/components/library/channel-badge";
import { openAppAction } from "@/app/(store)/library/actions";

/**
 * One app the member owns, as one big door (direction A of the 5 Oct 2026
 * Library mockups): what it is, what their plan includes, and a button that
 * opens it already signed in. Billing is one status line and one link; the
 * rest lives on the Account page.
 */

const TONE: Record<LibraryApp["statusLine"]["tone"], string> = {
  ok: "bg-[#e6f1e9] text-[#1f6b45]",
  trial: "bg-navy/10 text-navy",
  warn: "bg-primary/10 text-[#a64a28]",
  bad: "bg-primary/15 font-semibold text-[#a64a28]",
};

/** The tile's colour. Known apps get the colours the mockup was approved in. */
function tileColour(key: string): string {
  const known: Record<string, string> = { "content-engine": "var(--navy)", funnel: "var(--plum)" };
  if (known[key]) return known[key];
  const palette = ["#c8653d", "#2f2f36", "#1f5f5b", "var(--plum)", "var(--navy)"];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export function AppCard({ app }: { app: LibraryApp }) {
  const pastDue = app.status === "past_due";
  const arrow = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
  const button =
    "flex min-h-14 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 font-display text-base font-semibold text-primary-fg shadow-[0_10px_24px_-12px_rgba(166,74,40,0.7)] transition-colors hover:bg-primary-hover";
  const adds = app.badges.filter((b) => !b.included && b.addHref);

  return (
    // Sized by its own width (a container query), not the window's: the same
    // card sits full width on a desktop and alone on a phone.
    <article className="@container rounded-3xl border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(70,50,30,0.04),0_16px_40px_-18px_rgba(70,50,30,0.16)] sm:p-8">
     <div className="flex flex-col gap-6 @2xl:flex-row @2xl:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="grid size-16 shrink-0 place-items-center rounded-[18px] font-display text-[22px] font-extrabold tracking-tight text-white"
            style={{ background: tileColour(app.key) }}
          >
            {app.initials}
          </span>
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            {/* `!` because the store's own heading settings (h3 at 28px, and
                bigger on h1/h2) are written as :root rules that outrank a
                utility class; the library's type is the library's. */}
            <h3 className="text-2xl! font-bold! leading-tight! tracking-tight @2xl:text-[28px]!">{app.name}</h3>
            <span className={`inline-flex items-center gap-2 rounded-full py-0.5 pl-2.5 pr-3 text-[13px] ${TONE[app.statusLine.tone]}`}>
              <span aria-hidden className="size-[7px] rounded-full bg-current" />
              {app.statusLine.text}
            </span>
          </div>
        </div>

        {app.description && <p className="max-w-[56ch] text-pretty text-muted">{app.description}</p>}

        {app.badges.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="kicker text-muted">What your plan includes</span>
            <ul className="flex flex-wrap gap-2.5">
              {app.badges.map((b) => (
                <li key={b.channel}>
                  <ChannelBadge badge={b} />
                </li>
              ))}
            </ul>
            {adds.map((b) => (
              <a
                key={b.channel}
                href={b.addHref!}
                className="w-fit font-display text-sm font-semibold text-[#a64a28] hover:underline"
              >
                {b.addText} <span aria-hidden>&rarr;</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col justify-center gap-3 rounded-[18px] bg-surface-2 p-5 @2xl:w-80 @2xl:shrink-0">
        {/* An internal app is a page on this site: a link, and the session
            cookie does the rest. External apps go through the signed handoff. */}
        {app.kind === "internal" ? (
          app.route ? (
            <Link href={app.route} className={button}>
              Open {app.name}
              {arrow}
            </Link>
          ) : (
            <span className="text-center text-sm text-muted">Not available yet</span>
          )
        ) : (
          <form action={openAppAction}>
            <input type="hidden" name="appId" value={app.id} />
            <button className={button}>
              Open {app.name}
              {arrow}
            </button>
          </form>
        )}
        <span className="text-balance text-center text-[13px] text-muted">
          {app.kind === "internal" ? "Opens right here. You're already signed in." : `Opens ${app.host ?? "the app"}. You'll already be signed in.`}
        </span>
        <Link
          href="/account"
          className={`self-center text-[13.5px] underline decoration-border underline-offset-[3px] hover:text-fg ${pastDue ? "font-semibold text-[#a64a28]" : "font-medium text-muted"}`}
        >
          {pastDue ? "Update your card" : "Billing and invoices"}
        </Link>
      </div>
     </div>
    </article>
  );
}
