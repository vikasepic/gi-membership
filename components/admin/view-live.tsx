/**
 * A link to the page as a buyer sees it.
 *
 * Editing a sales page and looking at one are different jobs, and going from
 * the first to the second meant typing the URL from memory. New tab on purpose:
 * an admin who loses their place in a form to check a heading has been punished
 * for checking.
 *
 * It refuses to be a link when it would land on a 404 — the storefront hides a
 * draft product, and an offer page needs the offer active and the page actually
 * built. A link that goes nowhere teaches you not to trust the next one.
 */
export function ViewLive({
  href,
  unavailable,
  label = "View live",
}: {
  href: string;
  /** Why a buyer cannot reach it. Absent means they can. */
  unavailable?: string | null;
  label?: string;
}) {
  if (unavailable) {
    return (
      <span
        title={unavailable}
        className="w-fit cursor-not-allowed rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted"
      >
        {label} — {unavailable}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="w-fit rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg"
    >
      {label} ↗
    </a>
  );
}
