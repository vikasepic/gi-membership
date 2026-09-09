"use client";

/**
 * Everything the store can grant by hand, as tickboxes.
 *
 * Shared by the add-member form and by each member's row. It was written for
 * the first and copied nowhere, which is why an existing member could not be
 * granted anything at all: the action was there, the list was there, and the
 * only screen that rendered them was the one that creates an account. One
 * component, so a product that appears in one place appears in both.
 *
 * Checkboxes, not a select. A person can hold any number of products and
 * offers — the data model always allowed it — but one <select> could only ever
 * say one, so comping somebody two things meant granting them twice.
 */

export type GrantOption = { value: string; label: string };

const GROUPS = [
  { kind: "product", heading: "Products" },
  { kind: "offer", heading: "Offers" },
] as const;

/** "Offer — Book Writer" -> "Book Writer". The group heading carries the kind. */
function stripKind(label: string): string {
  return label.replace(/^(Product|Offer)\s+—\s+/, "");
}

export function GrantPicker({
  grants,
  /** Values already held, shown ticked and disabled — granting twice is a no-op that reads as an error. */
  held = [],
}: {
  grants: GrantOption[];
  held?: string[];
}) {
  const owned = new Set(held);
  return (
    <div className="rounded-xl border border-border p-3">
      {GROUPS.map(({ kind, heading }) => {
        const items = grants.filter((g) => g.value.startsWith(`${kind}:`));
        if (items.length === 0) return null;
        return (
          <div key={kind} className="mb-3 flex flex-col gap-1.5 last:mb-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {heading}
            </span>
            {items.map((g) => {
              const has = owned.has(g.value);
              return (
                <label
                  key={g.value}
                  className={`flex items-center gap-2 text-sm ${has ? "text-muted" : ""}`}
                >
                  <input
                    type="checkbox"
                    name="grant"
                    value={g.value}
                    defaultChecked={has}
                    disabled={has}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span>{stripKind(g.label)}</span>
                  {has && <span className="text-xs text-muted">already has it</span>}
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
