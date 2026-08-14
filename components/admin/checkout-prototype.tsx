"use client";

import { useState } from "react";
import { Section, inputClass } from "@/components/admin/form-controls";
import { money } from "@/lib/money";
import { readableInk, tint } from "@/lib/color";

/**
 * The checkout as something you BUILD, not something you tick.
 *
 * The first attempt at this was a panel of switches, and it was wrong: a
 * switch can only answer "is this here", never "where, how big, and in which
 * of the two columns". A checkout is a page, and the thing that edits pages in
 * this app is the block builder.
 *
 * So the real one is the builder you already use, pointed at a page with TWO
 * zones instead of one — the left, which sells, and the right, which takes the
 * money. Every block already knows how to be sized, coloured, aligned, hidden
 * on a phone and dragged somewhere else, and none of that has to be built
 * again for this page.
 *
 * What the checkout adds is a handful of blocks only it has, and one rule the
 * sales page does not need: some of them cannot be deleted. The card fields,
 * the total and the terms line are what make the page a checkout rather than a
 * description of one. They can be MOVED — position is a design decision — but
 * not removed, and the panel says why rather than leaving a missing bin icon
 * to be read as a bug.
 *
 * This prototype is that arrangement, at the fidelity worth arguing about:
 * two zones, reorder within a zone, move between zones, and a size on each
 * piece. Nothing saves.
 */

type Piece = {
  id: string;
  label: string;
  /** What it is, in the tray's terms. */
  kind:
    | "summary"
    | "bullets"
    | "coupon"
    | "payment"
    | "total"
    | "pay"
    | "logos"
    | "secure"
    | "guarantee"
    | "heading"
    | "text"
    | "image"
    | "html";
  /** The card fields, the total and the terms cannot go. */
  fixed?: boolean;
  size: number;
  color: string | null;
  text?: string;
};

const START: { left: Piece[]; right: Piece[] } = {
  left: [
    { id: "l1", label: "Heading", kind: "heading", size: 30, color: null, text: "Build the entire funnel in one sitting." },
    { id: "l2", label: "What is included", kind: "bullets", size: 15, color: null },
    { id: "l3", label: "Card logos", kind: "logos", size: 12, color: null },
    { id: "l4", label: "Secure-server line", kind: "secure", size: 12, color: null },
  ],
  right: [
    { id: "r1", label: "Order summary", kind: "summary", size: 15, color: null },
    { id: "r2", label: "Coupon field", kind: "coupon", size: 14, color: null },
    { id: "r3", label: "Card fields", kind: "payment", size: 14, color: null, fixed: true },
    { id: "r4", label: "Due today", kind: "total", size: 22, color: null, fixed: true },
    { id: "r5", label: "Pay button", kind: "pay", size: 16, color: null, text: "Start 7-day free trial", fixed: true },
  ],
};

const TRAY: { kind: Piece["kind"]; label: string }[] = [
  { kind: "heading", label: "Heading" },
  { kind: "text", label: "Text" },
  { kind: "bullets", label: "What is included" },
  { kind: "summary", label: "Order summary" },
  { kind: "coupon", label: "Coupon field" },
  { kind: "guarantee", label: "Guarantee" },
  { kind: "logos", label: "Card logos" },
  { kind: "secure", label: "Secure-server line" },
  // A picture of your own — the card marks we ship are one arrangement of one
  // idea, and somebody will always want their own badges, a portrait, a seal.
  { kind: "image", label: "Image" },
  // And the escape hatch. Everything above is a thing we decided to offer; this
  // is for the thing we did not think of, which on a checkout is usually a
  // trust seal from whoever the buyer already trusts.
  { kind: "html", label: "HTML" },
];

const WHY_FIXED: Record<string, string> = {
  payment:
    "Stripe draws these, and that is what keeps card numbers out of this codebase. Move them anywhere; they cannot be removed.",
  total: "A checkout that does not say what it is about to charge is not a checkout.",
  pay: "The thing that takes the money. Its words and its colour are yours; its existence is not.",
};

export function CheckoutPrototype() {
  const [cols, setCols] = useState(START);
  const [sel, setSel] = useState<string | null>("l1");
  const [accent, setAccent] = useState("#b0532f");
  const [bg, setBg] = useState("#faf9f6");
  const [panel, setPanel] = useState("#ffffff");
  const [ink, setInk] = useState("#16181f");
  const [split, setSplit] = useState(52);

  const all = [...cols.left, ...cols.right];
  const chosen = all.find((p) => p.id === sel) ?? null;
  const side = (id: string): "left" | "right" => (cols.left.some((p) => p.id === id) ? "left" : "right");

  const edit = (id: string, patch: Partial<Piece>) =>
    setCols({
      left: cols.left.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      right: cols.right.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });

  const move = (id: string, by: number) => {
    const s = side(id);
    const list = [...cols[s]];
    const i = list.findIndex((p) => p.id === id);
    const to = i + by;
    if (to < 0 || to >= list.length) return;
    [list[i], list[to]] = [list[to], list[i]];
    setCols({ ...cols, [s]: list });
  };

  const across = (id: string) => {
    const from = side(id);
    const to = from === "left" ? "right" : "left";
    const piece = cols[from].find((p) => p.id === id)!;
    setCols({ ...cols, [from]: cols[from].filter((p) => p.id !== id), [to]: [...cols[to], piece] });
  };

  const remove = (id: string) => {
    const p = all.find((x) => x.id === id);
    if (p?.fixed) return;
    setCols({ left: cols.left.filter((x) => x.id !== id), right: cols.right.filter((x) => x.id !== id) });
    setSel(null);
  };

  const add = (kind: Piece["kind"], label: string) => {
    const piece: Piece = {
      id: `n${Date.now()}`,
      label,
      kind,
      size: kind === "heading" ? 28 : 15,
      color: null,
      text:
        kind === "heading"
          ? "A heading"
          : kind === "text"
            ? "Some words."
            : kind === "image"
              ? ""
              : kind === "html"
                ? '<span class="badge">Anything you like</span>'
                : undefined,
    };
    setCols({ ...cols, left: [...cols.left, piece] });
    setSel(piece.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[200px_minmax(0,1fr)_290px]">
        {/* The tray. */}
        <Section title="Add" hint="Dropped into the left column; drag it across after.">
          <div className="flex flex-col gap-1">
            {TRAY.map((t) => (
              <button
                key={t.kind + t.label}
                type="button"
                onClick={() => add(t.kind, t.label)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary"
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="mt-2 flex flex-col gap-1 text-[0.68rem] text-muted">
            Split — how wide the left column is
            <span className="flex items-center gap-2">
              <input
                type="range"
                min={30}
                max={70}
                value={split}
                onChange={(e) => setSplit(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-9 tabular-nums">{split}%</span>
            </span>
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                [bg, setBg, "Page"],
                [panel, setPanel, "Panel"],
                [accent, setAccent, "Button"],
                [ink, setInk, "Text"],
              ] as const
            ).map(([v, set, label]) => (
              <label key={label} className="flex items-center gap-1.5 text-[0.68rem] text-muted">
                <input
                  type="color"
                  value={v}
                  onChange={(e) => set(e.target.value)}
                  className="size-6 shrink-0 rounded border border-border"
                />
                {label}
              </label>
            ))}
          </div>
        </Section>

        {/* The canvas: two zones, because the page has two. */}
        <div className="rounded-2xl border border-border p-4" style={{ background: bg }}>
          <div className="flex gap-4" style={{ alignItems: "flex-start" }}>
            {(["left", "right"] as const).map((zone) => (
              <div
                key={zone}
                className="flex min-w-0 flex-col gap-2 rounded-xl border border-dashed p-2"
                style={{
                  flex: zone === "left" ? split : 100 - split,
                  borderColor: tint(ink, 0.18),
                  background: zone === "right" ? panel : undefined,
                }}
              >
                <span className="text-[0.6rem] uppercase tracking-[0.12em]" style={{ color: tint(ink, 0.45) }}>
                  {zone === "left" ? "Left — sells it" : "Right — takes the money"}
                </span>
                {cols[zone].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSel(p.id)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      sel === p.id ? "border-primary" : "border-transparent hover:border-border"
                    }`}
                    style={{ color: p.color ?? ink }}
                  >
                    <Preview piece={p} accent={accent} ink={ink} />
                  </button>
                ))}
                {cols[zone].length === 0 && (
                  <span className="px-3 py-6 text-center text-[0.7rem]" style={{ color: tint(ink, 0.45) }}>
                    Nothing here yet
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* The inspector, per piece. */}
        <Section title={chosen ? chosen.label : "Nothing selected"} hint={chosen ? "" : "Pick something on the canvas."}>
          {chosen ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                <Btn onClick={() => move(chosen.id, -1)}>Up</Btn>
                <Btn onClick={() => move(chosen.id, 1)}>Down</Btn>
                <Btn onClick={() => across(chosen.id)}>
                  Move {side(chosen.id) === "left" ? "right →" : "← left"}
                </Btn>
                <Btn onClick={() => remove(chosen.id)} disabled={chosen.fixed}>
                  Remove
                </Btn>
              </div>

              {chosen.fixed && (
                <p className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[0.7rem] leading-relaxed text-muted">
                  {WHY_FIXED[chosen.kind]}
                </p>
              )}

              {chosen.kind === "image" ? (
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Picture
                  <input
                    value={chosen.text ?? ""}
                    placeholder="Paste a URL — the real one opens your media library"
                    onChange={(e) => edit(chosen.id, { text: e.target.value })}
                    className={inputClass}
                  />
                  <span className="text-[0.66rem]">
                    In the real editor this is the same picker every other image uses, so a
                    checkout badge is a file in your library like anything else.
                  </span>
                </label>
              ) : chosen.kind === "html" ? (
                <label className="flex flex-col gap-1 text-xs text-muted">
                  HTML
                  <textarea
                    rows={4}
                    value={chosen.text ?? ""}
                    onChange={(e) => edit(chosen.id, { text: e.target.value })}
                    className={`${inputClass} font-mono text-[0.7rem]`}
                  />
                  <span className="text-[0.66rem]">
                    Sanitised on save, the same way the HTML block already is — a checkout is the
                    last page that should be able to run somebody else&rsquo;s script.
                  </span>
                </label>
              ) : chosen.text !== undefined ? (
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Words
                  <input
                    value={chosen.text}
                    onChange={(e) => edit(chosen.id, { text: e.target.value })}
                    className={inputClass}
                  />
                </label>
              ) : null}

              <label className="flex flex-col gap-1 text-xs text-muted">
                Size
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    min={10}
                    max={44}
                    value={chosen.size}
                    onChange={(e) => edit(chosen.id, { size: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-9 tabular-nums">{chosen.size}px</span>
                </span>
              </label>

              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="color"
                  value={chosen.color ?? ink}
                  onChange={(e) => edit(chosen.id, { color: e.target.value })}
                  className="size-7 shrink-0 rounded border border-border"
                />
                Colour
                {chosen.color && (
                  <button
                    type="button"
                    onClick={() => edit(chosen.id, { color: null })}
                    className="ml-auto text-[0.68rem] text-muted hover:text-fg"
                  >
                    Reset
                  </button>
                )}
              </label>
            </div>
          ) : null}
        </Section>
      </div>

      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
        <b className="font-medium text-fg">What this is really proposing:</b> the checkout becomes a
        page with two block zones, edited by the builder you already use. Every block in it already
        knows how to be sized, coloured, aligned, reordered and hidden on a phone — none of that
        gets rebuilt here. The checkout only adds a few blocks of its own, and one rule the sales
        page does not need: the card fields, the total and the pay button can be moved but not
        removed, and the panel says why instead of leaving a missing bin icon to be read as a bug.
        The controls above are deliberately the crude version — in the real one they are the
        inspector, with per-device values and everything else it already carries.
      </p>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "This one cannot be removed" : undefined}
      className="rounded-lg border border-border px-2 py-1 text-[0.68rem] transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Each piece, roughly as the checkout draws it. */
function Preview({ piece, accent, ink }: { piece: Piece; accent: string; ink: string }) {
  const s = { fontSize: piece.size, color: piece.color ?? ink } as React.CSSProperties;
  switch (piece.kind) {
    case "heading":
      return <span className="block font-display font-semibold leading-tight" style={s}>{piece.text}</span>;
    case "text":
      return <span className="block leading-snug" style={s}>{piece.text}</span>;
    case "bullets":
      return (
        <span className="flex flex-col gap-0.5" style={s}>
          {["3 funnels every month", "Unlimited edits", ".docx export"].map((b) => (
            <span key={b}>✓ {b}</span>
          ))}
        </span>
      );
    case "summary":
      return (
        <span className="flex items-baseline justify-between gap-3" style={s}>
          <span>Funnel App</span>
          <span className="tabular-nums">{money(0)}</span>
        </span>
      );
    case "coupon":
      return (
        <span className="flex gap-1.5" style={s}>
          <span className="flex-1 rounded border border-current px-2 py-1 opacity-60">Coupon code</span>
          <span className="rounded border border-current px-2 py-1">Apply</span>
        </span>
      );
    case "payment":
      return (
        <span className="flex flex-col gap-1" style={s}>
          {["Card", "Apple Pay", "Cash App Pay"].map((m) => (
            <span key={m} className="rounded border border-current px-2 py-1 opacity-70">
              {m}
            </span>
          ))}
        </span>
      );
    case "total":
      return (
        <span className="flex items-baseline justify-between gap-3 font-display" style={s}>
          <span>Due today</span>
          <span className="tabular-nums">{money(0)}</span>
        </span>
      );
    case "pay":
      return (
        <span
          className="block rounded-full px-4 py-2 text-center font-medium"
          style={{ ...s, background: accent, color: readableInk(accent) }}
        >
          {piece.text}
        </span>
      );
    case "logos":
      return (
        <span className="flex flex-wrap gap-1" style={s}>
          {["VISA", "MC", "AMEX", "Pay"].map((l) => (
            <span key={l} className="rounded border border-current px-1.5 opacity-70">
              {l}
            </span>
          ))}
        </span>
      );
    case "secure":
      return <span className="block opacity-70" style={s}>🔒 Card details go straight to Stripe.</span>;
    case "guarantee":
      return <span className="block opacity-80" style={s}>30 days. One email and it is refunded.</span>;
    case "image":
      return piece.text ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={piece.text}
          alt=""
          className="block w-full rounded object-contain"
          style={{ maxHeight: piece.size * 4 }}
        />
      ) : (
        <span
          className="flex items-center justify-center rounded border border-dashed border-current px-3 opacity-50"
          style={{ ...s, height: piece.size * 3 }}
        >
          Pick a picture
        </span>
      );
    case "html":
      return (
        <span
          className="block [&_*]:!m-0"
          style={s}
          // The admin's own markup, in the admin's own prototype. The real one
          // runs it through the same sanitiser the HTML block uses.
          dangerouslySetInnerHTML={{ __html: piece.text ?? "" }}
        />
      );
  }
}
