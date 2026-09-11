import Link from "next/link";
import { legalPlaceholders, type Legal } from "@/lib/legal";
import { LEGAL_DEFAULTS } from "@/lib/legal-defaults";

// Shared shell for the policy pages: one measure, one type scale, one place the
// "still a draft" warning lives.
//
// The warning is deliberately loud and rendered to everyone, not hidden behind
// an admin check. A policy with unfilled blanks that LOOKS finished is worse
// than an obviously unfinished one — a buyer must not be told a term is binding
// when the store owner hasn't decided it yet.
export function LegalPage({
  title,
  intro,
  legal,
  children,
}: {
  title: string;
  intro?: string;
  /** Passed in rather than read here — the page already had to resolve it. */
  legal: Legal;
  children: React.ReactNode;
}) {
  const placeholders = legalPlaceholders(legal);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-4">
      <div className="flex flex-col gap-3">
        <Link href="/" className="kicker w-fit text-muted hover:text-fg">
          &larr; Store
        </Link>
        <h1 className="text-3xl leading-tight md:text-4xl">{title}</h1>
        {intro && <p className="text-lg text-muted text-pretty">{intro}</p>}
        <p className="text-sm text-muted">Last updated {legal.lastUpdated}</p>
      </div>

      {placeholders.length > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl border border-primary/40 bg-primary/5 px-5 py-4">
          <span className="font-medium text-fg">This policy is not finished</span>
          <p className="text-sm text-muted">
            Still to be filled in by the store: {placeholders.join(", ")}. Until then, treat
            this page as a draft rather than a binding agreement.
          </p>
        </div>
      )}

      {/* text-pretty avoids orphans across long prose; 65ch keeps the measure
          readable, which is most of what makes a policy page survivable. */}
      <div className="flex flex-col gap-7 leading-relaxed text-fg/90 [&_a]:text-primary [&_a]:underline [&_li]:text-pretty [&_p]:text-pretty">
        {children}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm text-muted">
        <Link href="/terms" className="hover:text-fg">Terms of Service</Link>
        <Link href="/privacy" className="hover:text-fg">Privacy Policy</Link>
        <a href={LEGAL_DEFAULTS.earningsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-fg">Earnings Disclaimer</a>
      </div>
    </div>
  );
}

export function Clause({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-display text-lg text-fg">{heading}</h2>
      {children}
    </section>
  );
}
