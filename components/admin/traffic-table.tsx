/**
 * The gap between what happened and what the ad tools saw.
 *
 * Deliberately not a percentage. `counted` sums page views across four pages
 * over the window; `consented` counts people, upserted once per visitor ever
 * (first touch), so a returning visitor or one who crosses pages inflates the
 * gap without meaning the pixel missed more. States both numbers and leaves
 * the reading to the owner instead of asserting a wrong one.
 */
export function CoverageNote({ counted, consented }: { counted: number; consented: number }) {
  if (counted === 0) return null;
  return (
    <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
      <span className="font-medium text-fg">{counted}</span> views counted here, against{" "}
      <span className="font-medium text-fg">{consented}</span> visitors your pixel saw in the
      same window. These count different things — views against people, and one person browsing
      three pages is three views — so read the gap as a direction, not a percentage.
    </p>
  );
}
