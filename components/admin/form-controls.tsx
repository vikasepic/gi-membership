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
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border-b border-border/60 py-4 last:border-b-0 first:pt-1">
      <span className="mb-2.5 block text-[0.6rem] font-medium uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      {hint && <p className="-mt-1.5 mb-2.5 text-xs text-muted">{hint}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}
