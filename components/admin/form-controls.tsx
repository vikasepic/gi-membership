export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary";

export function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  // When set, the input reads as invalid and the message shows beneath it. The
  // form can supply this from client-side checks or a returned server error, so
  // a bad value is flagged in place without the page reloading.
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-primary"> *</span>}
        {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
      </span>
      {children}
      {error && <span className="text-sm text-primary">{error}</span>}
    </label>
  );
}

// Groups related fields under a heading and a plain-English explanation, so a
// long admin form reads as a few decisions instead of one wall of inputs.
export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-base">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * A group of fields, without a card around it.
 *
 * `Section` draws a bordered white box with a heading and a paragraph of hint —
 * about 90px of chrome before a field. Five of them stacked is most of a screen
 * spent on separating fields from fields. This is the same job in a hairline and
 * a small label, for the forms where density is the point.
 */
export function Group({
  label,
  children,
  hint,
  changed,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  /** How many of this group's settings are no longer at their default. */
  changed?: number;
}) {
  return (
    // A rule above and a lot of air below it. The group's boundary has to read
    // louder than the gaps between its own rows, or a panel of thirty fields is
    // thirty fields rather than five decisions — which is what this was.
    <section className="border-t border-border pt-7 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-2.5">
        {/* A heading, not a caption. This was 0.6rem uppercase muted — smaller
            and lighter than the field labels underneath it, so the weakest
            thing on screen was the one carrying the structure. */}
        <h3 className="text-[0.82rem] font-semibold text-fg">{label}</h3>
        {changed ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.62rem] font-medium text-primary">
            {changed} changed
          </span>
        ) : null}
      </div>
      {hint && <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-muted">{hint}</p>}
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </section>
  );
}

/**
 * A named part of a group.
 *
 * The level that was missing. "Logo & bar" is two objects with their own
 * geometry, and "Links" is a list of destinations followed by the type they are
 * set in — one heading over all of it means the only way to find the bar's
 * height is to read every row above it.
 */
export function Sub({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      {hint && <p className="mt-1 max-w-[62ch] text-xs text-muted">{hint}</p>}
      <div className="mt-2.5 flex flex-col gap-2">{children}</div>
    </div>
  );
}

/**
 * A short list of choices, all of them visible.
 *
 * These panels were columns of `<select>`s reading "Inherit" or "Today: yes",
 * stretched across the width available. Ten identical white bars you have to
 * open one at a time to read is slower than showing two to four words, and it
 * hides the one thing worth seeing at a glance: which rows are still at their
 * default and which are not.
 *
 * A select is still right above about five options — Family and Weight keep
 * theirs. This is for the sets small enough that hiding them costs more room
 * than showing them.
 */
export function Seg({
  label,
  value,
  onChange,
  options,
  firstLabel = "Default",
  defaultIs,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** The real choices. The unset one is prepended and must not appear here. */
  options: readonly (readonly [string, string])[];
  /** What the unset chip says — "Default", "Inherit", "Body font — Poppins". */
  firstLabel?: string;
  /** What leaving it alone actually does, named once, only while it applies. */
  defaultIs?: string;
}) {
  const all: readonly (readonly [string, string])[] = [["", firstLabel], ...options];
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        role="group"
        aria-label={label}
        className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
      >
        {all.map(([v, l]) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(v)}
              className={`rounded-[0.3rem] px-2 py-1 text-[0.7rem] transition-colors ${
                on ? "bg-surface font-medium text-fg shadow-sm" : "text-muted hover:text-fg"
              }`}
            >
              {l}
            </button>
          );
        })}
      </span>
      {defaultIs && value === "" && <span className="text-[0.62rem] text-muted">{defaultIs}</span>}
    </span>
  );
}
