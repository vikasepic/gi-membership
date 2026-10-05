import Link from "next/link";
import type { ReactNode } from "react";
import type { LibraryApp } from "@/lib/library";
import { ChannelBadge } from "@/components/library/channel-badge";
import { openAppAction } from "@/app/(store)/library/actions";

/**
 * One app the member owns (the 5 Oct 2026 Library redesign, "C · wide grid").
 *
 * Two sizes. A member with one app gets the large card: the product picture,
 * the details, then Open on the right. A member with several gets compact
 * cards three across, picture on top and the Open button pinned to the bottom
 * of each so the row lines up. Billing is the status line and one link either
 * way; the rest lives on /account. The initials tile is the fallback for an
 * app whose offers carry no picture.
 *
 * Headings carry `!` sizes: the store's heading settings are :root rules meant
 * for sales pages and outrank a utility class.
 */

const TONE: Record<LibraryApp["statusLine"]["tone"], string> = {
  ok: "bg-[#e6f1e9] text-[#1f6b45]",
  trial: "bg-navy/10 text-navy",
  warn: "bg-primary/10 text-[#a64a28]",
  bad: "bg-primary/15 font-semibold text-[#a64a28]",
};

/** The tile's colour. Known apps keep the colours the mockup was approved in. */
function tileColour(key: string): string {
  const known: Record<string, string> = {
    "content-engine": "var(--navy)",
    funnel: "var(--plum)",
    "micro-product-builder": "#1f5f5b",
    "hook-generator": "#2f2f36",
  };
  if (known[key]) return known[key];
  const palette = ["#c8653d", "#2f2f36", "#1f5f5b", "var(--plum)", "var(--navy)"];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

const ARROW = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </svg>
);

/** Open: a link for an app on this site, the signed handoff for one elsewhere. */
function OpenButton({ app, className }: { app: LibraryApp; className: string }) {
  if (app.kind === "internal") {
    return app.route ? (
      <Link href={app.route} className={className}>
        Open {app.name}
        {ARROW}
      </Link>
    ) : (
      <span className="text-center text-sm text-muted">Not available yet</span>
    );
  }
  return (
    <form action={openAppAction}>
      <input type="hidden" name="appId" value={app.id} />
      <button className={className}>
        Open {app.name}
        {ARROW}
      </button>
    </form>
  );
}

/** The product picture. Decorative: the name sits right beside it. */
function Picture({ src, className }: { src: string; className: string }) {
  return (
    <div className={`relative overflow-hidden bg-surface-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}

function Header({ app, big }: { app: LibraryApp; big: boolean }) {
  return (
    <div className={`flex items-center ${big ? "gap-4" : "gap-3.5"}`}>
      {!app.imageUrl && (
        <span
          aria-hidden
          className={`grid shrink-0 place-items-center font-display font-extrabold tracking-tight text-white ${
            big ? "size-16 rounded-[18px] text-[22px]" : "size-[52px] rounded-[15px] text-lg"
          }`}
          style={{ background: tileColour(app.key) }}
        >
          {app.initials}
        </span>
      )}
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <h3 className={big ? "text-[26px]! font-bold! leading-tight! tracking-tight" : "text-[19px]! font-bold! leading-tight! tracking-tight"}>
          {app.name}
        </h3>
        <span className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-2 pr-2.5 text-[12.5px] ${TONE[app.statusLine.tone]}`}>
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {app.statusLine.text}
        </span>
      </div>
    </div>
  );
}

function Channels({ app, size }: { app: LibraryApp; size: "md" | "sm" }): ReactNode {
  if (app.badges.length === 0) return null;
  const adds = app.badges.filter((b) => !b.included && b.addHref);
  return (
    <div className="flex flex-col gap-2.5">
      {size === "md" && <span className="kicker text-muted">What your plan includes</span>}
      <ul className={`flex flex-wrap ${size === "md" ? "gap-2.5" : "gap-x-2 gap-y-1.5"}`} aria-label="What your plan includes">
        {app.badges.map((b) => (
          <li key={b.channel}>
            <ChannelBadge badge={b} size={size} />
          </li>
        ))}
      </ul>
      {adds.map((b) => (
        <a key={b.channel} href={b.addHref!} className="w-fit font-display text-[13.5px] font-semibold text-[#a64a28] hover:underline">
          {b.addText} <span aria-hidden>&rarr;</span>
        </a>
      ))}
    </div>
  );
}

export function AppCard({ app, variant }: { app: LibraryApp; variant: "featured" | "compact" }) {
  const pastDue = app.status === "past_due";

  if (variant === "featured") {
    return (
      // A container cannot query its own width, so the card is the container
      // and the row inside it is what changes shape.
      <article className="@container rounded-[22px] border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(70,50,30,0.04),0_16px_40px_-20px_rgba(70,50,30,0.14)] sm:p-7">
        <div className="flex flex-col gap-6 @4xl:flex-row @4xl:items-center @4xl:gap-9">
          {app.imageUrl && <Picture src={app.imageUrl} className="aspect-[16/10] w-full shrink-0 rounded-2xl @4xl:w-[22rem]" />}
          <div className="flex min-w-0 flex-1 flex-col gap-6 @2xl:flex-row @2xl:gap-10">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <Header app={app} big />
              {app.description && <p className="max-w-[60ch] text-pretty text-muted">{app.description}</p>}
              <Channels app={app} size="md" />
            </div>
            <div className="flex flex-col justify-center gap-2.5 border-t border-border pt-6 @2xl:w-72 @2xl:shrink-0 @2xl:border-l @2xl:border-t-0 @2xl:pl-8 @2xl:pt-0">
              <OpenButton
                app={app}
                className="flex min-h-14 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-5 font-display text-base font-semibold text-primary-fg shadow-[0_10px_24px_-12px_rgba(166,74,40,0.7)] transition-colors hover:bg-primary-hover"
              />
              <span className="text-balance text-center text-[13px] text-muted">
                {app.kind === "internal" ? "Opens right here. You're already signed in." : `Opens ${app.host ?? "the app"}. You'll be signed in automatically.`}
              </span>
              <Link
                href="/account"
                className={`self-center text-[13px] underline decoration-border underline-offset-[3px] hover:text-fg ${pastDue ? "font-semibold text-[#a64a28]" : "text-muted"}`}
              >
                {pastDue ? "Update your card" : "Billing and invoices"}
              </Link>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_1px_2px_rgba(70,50,30,0.04),0_14px_32px_-20px_rgba(70,50,30,0.14)]">
      {app.imageUrl && <Picture src={app.imageUrl} className="aspect-[16/9] w-full border-b border-border" />}
      <div className="flex flex-1 flex-col gap-3.5 p-[22px]">
        <Header app={app} big={false} />
        {app.description && <p className="line-clamp-3 text-sm leading-relaxed text-muted">{app.description}</p>}
        <Channels app={app} size="sm" />
        <div className="mt-auto flex flex-col gap-2.5 pt-1.5">
          <OpenButton
            app={app}
            className="flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 font-display text-[15px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          />
          <div className="flex items-center justify-between gap-3 text-[12.5px] text-muted">
            <span>{app.kind === "internal" ? "Opens right here" : "Signed in automatically"}</span>
            <Link
              href="/account"
              className={`whitespace-nowrap underline decoration-border underline-offset-[3px] hover:text-fg ${pastDue ? "font-semibold text-[#a64a28]" : ""}`}
            >
              {pastDue ? "Update your card" : "Billing"}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
