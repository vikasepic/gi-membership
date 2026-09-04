import Link from "next/link";
import { money } from "@/lib/money";
import type { PurchaseSummary } from "@/lib/purchase-summary";

/**
 * What somebody sees the moment after they pay.
 *
 * The page used to say "your purchase is in your library" and name nothing —
 * true, and useless: a buyer who has just handed over a card wants to see the
 * thing, and a bump they ticked in passing is easy to forget having bought at
 * all. Everything here comes from `order_items`, so it can only show what was
 * actually charged.
 *
 * The steps are numbered because they happen in an order, and each one is only
 * drawn when it applies to this buyer. A step telling somebody to open an app
 * they did not buy is worse than no step.
 */

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

function Line({ line, currency }: { line: PurchaseSummary["lines"][number]; currency: string }) {
  const body = (
    <>
      <div
        className="relative aspect-[16/10] w-24 shrink-0 overflow-hidden rounded-xl border border-border"
        style={{
          backgroundImage:
            "radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--navy) 8%, var(--surface)), var(--surface-2))",
        }}
      >
        {line.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={line.imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain p-1.5" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium leading-snug">{line.title}</span>
        {line.trialEndsOn ? (
          // The date is the point. It is the first place a buyer sees when the
          // free part ends, and it is far cheaper than a surprise charge.
          <span className="text-sm text-muted">
            Free until {dayMonth(line.trialEndsOn)}
            {line.recurringNote ? `, then ${line.recurringNote}` : ""}
          </span>
        ) : (
          line.kind === "bump" && <span className="text-sm text-muted">Added to your order</span>
        )}
      </div>
      <span className="shrink-0 self-start text-sm tabular-nums text-muted">
        {money(line.amountCents, currency)}
      </span>
    </>
  );

  return line.href ? (
    <Link
      href={line.href}
      className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-primary"
    >
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3">{body}</div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy/10 text-sm font-semibold text-navy">
        {n}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium leading-snug">{title}</span>
        <span className="text-sm text-muted">{children}</span>
      </div>
    </li>
  );
}

export function PurchaseReceipt({ summary }: { summary: PurchaseSummary }) {
  const openable = summary.lines.find((l) => l.href);
  const discounted = summary.listCents > summary.paidCents;
  let step = 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-10 py-14">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-4xl leading-tight text-balance md:text-5xl">
          You&rsquo;re in{summary.firstName ? `, ${summary.firstName}` : ""}.
        </h1>
        <p className="text-muted text-pretty">
          Payment received. Everything below is yours now and stays in your library.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="kicker text-muted">What you got</h2>
          <span className="text-sm text-muted">
            {discounted && (
              <span className="mr-2 line-through opacity-60">
                {money(summary.listCents, summary.currency)}
              </span>
            )}
            <span className="font-medium text-fg">{money(summary.paidCents, summary.currency)}</span>
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          {summary.lines.map((line, i) => (
            <Line key={`${line.kind}-${i}`} line={line} currency={summary.currency} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="kicker text-muted">What happens next</h2>
        <ol className="flex flex-col gap-4">
          {openable && (
            <Step n={++step} title={`Start ${openable.title}`}>
              It&rsquo;s ready now —{" "}
              <Link href={openable.href!} className="text-primary hover:underline">
                open it
              </Link>
              .
            </Step>
          )}
          <Step n={++step} title="Your receipt is on its way">
            {/* Deliberately not "check your inbox". The send waits half an hour
                so it cannot race a buyer still deciding on an upsell, and a page
                that promises an email that is not there yet earns a support
                reply. */}
            It arrives by email within the hour, with a link that signs you in — no password to
            remember.
          </Step>
          {summary.hasApp && (
            <Step n={++step} title="Open your app">
              It&rsquo;s under <span className="text-fg">Your apps</span> in the library, and the
              link signs you straight in.
            </Step>
          )}
        </ol>
      </section>

      <div className="flex justify-center">
        <Link
          href="/library"
          className="rounded-full bg-primary px-7 py-3.5 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
        >
          Go to your library
        </Link>
      </div>
    </div>
  );
}
