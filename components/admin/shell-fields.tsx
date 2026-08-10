"use client";

import { useState } from "react";
import { Group, Sub } from "@/components/admin/form-controls";
import {
  SHELL_CASES,
  SHELL_DEFAULT_LINKS,
  SHELL_WEIGHTS,
  normalizeSiteShell,
  shellHasTabs,
  shellHrefIsValid,
  type ShellLink,
  type SiteShell,
} from "@/lib/site-shell";
import { colorIsValid } from "@/lib/site-typography";

/**
 * The header, the navigation and the footer.
 *
 * One JSON field rather than thirty inputs, the way the Typography panel and
 * the page editor both post. Every control offers "Default" first and means it:
 * leaving the whole panel alone is the same store it was before the panel
 * existed.
 *
 * The panel used to say so thirty times. Every field's placeholder began
 * "Today:" and every select's first option did too, which put the word on
 * screen fourteen times to make a point that is true of the whole page — so it
 * stopped being read, and stopped distinguishing the two rows where it
 * mattered. It is now said once, at the top, and each control names only the
 * value itself.
 *
 * The other thing thirty identical rows could not show is which of them you
 * have actually changed. Roughly two of these are ever set on a real store, and
 * the twenty-eight at their default looked exactly the same as the two that
 * were not. Now a changed row carries a revert control and its group carries a
 * count, so "what have I done to the header" is answerable by looking.
 */

/**
 * What is wrong with a link row, in the words of what happens to it.
 *
 * `shellLinks` draws a row only when it has both halves, and the save keeps a
 * half-written row rather than deleting it — so the two states a person needs
 * told apart are "this will not be saved" and "this is saved but not shown".
 * Both used to be silence: a label with no URL passed `shellHrefIsValid`
 * (which is true for ""), was dropped by the save's own filter, and the panel
 * came back one link shorter with no error anywhere. The call to action next
 * door has said this for its own pair since it was written.
 */
function rowNote(l: ShellLink): string {
  if (!shellHrefIsValid(l.href)) return "Not a link this will keep — start with / or https://";
  if (l.label !== "" && l.href === "") return "No link yet, so this row is saved but not shown";
  if (l.label === "" && l.href !== "") return "No label yet, so this row is saved but not shown";
  return "";
}

/** Which settings belong to which heading, so a group can count its own. */
const GROUP_KEYS = {
  bar: [
    "logoHeightDesktop",
    "logoHeightMobile",
    "brandFallback",
    "barColor",
    "barTranslucent",
    "barSticky",
    "barBorder",
    "barHeightDesktop",
    "barHeightMobile",
    "barWidth",
  ],
  links: [
    "linkSizeDesktop",
    "linkSizeMobile",
    "linkWeight",
    "linkCase",
    "linkLetterSpacing",
    "linkColor",
    "linkHoverColor",
    "linkCurrentColor",
    "currentMark",
  ],
  cta: ["ctaLabel", "ctaHref", "ctaOnMobile"],
  mobile: ["mobileNav", "tabLabels"],
  footer: ["footerLogoHeight", "footerNote"],
} satisfies Record<string, (keyof SiteShell)[]>;

/** Each case option written in its own case, so the chip demonstrates itself. */
const CASE_LABEL: Record<string, string> = {
  uppercase: "UPPERCASE",
  lowercase: "lowercase",
  capitalize: "Capitalized",
};

/** The type controls almost nobody touches, folded away unless one is set. */
const TYPE_DETAIL: (keyof SiteShell)[] = ["linkWeight", "linkCase", "linkLetterSpacing"];

export function ShellFields({
  siteShell,
  errors,
}: {
  siteShell: SiteShell;
  errors: Record<string, string>;
}) {
  // Normalised on the way in so the panel edits the shape the save will parse —
  // a blob written before a field existed would otherwise put `undefined` into
  // an input and turn it uncontrolled halfway through a session.
  const [s, setS] = useState<SiteShell>(() => normalizeSiteShell(siteShell));
  const patch = (p: Partial<SiteShell>) => setS({ ...s, ...p });

  // A field is at its default when it is empty — that is the whole schema's
  // convention, which is why one predicate answers it for every control here.
  const isSet = (k: keyof SiteShell) => String(s[k] ?? "") !== "";
  const countSet = (keys: readonly (keyof SiteShell)[]) => keys.filter(isSet).length;

  /** Spread into a Row: whether it has been changed, and how to put it back. */
  const revert = (...keys: (keyof SiteShell)[]) => ({
    changed: keys.some(isSet),
    onRevert: () => patch(Object.fromEntries(keys.map((k) => [k, ""])) as Partial<SiteShell>),
  });

  // The links as the editor shows them: the three built-in ones until somebody
  // touches something, at which point the whole list is written down. `null`
  // rather than an empty array is what makes "remove them all" reachable — an
  // empty array is a decision and is posted as one.
  const rows: readonly ShellLink[] = s.links ?? SHELL_DEFAULT_LINKS;
  const setRows = (next: ShellLink[]) => patch({ links: next });
  const editRow = (i: number, p: Partial<ShellLink>) =>
    setRows(rows.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    const to = i + by;
    if (to < 0 || to >= next.length) return;
    [next[i], next[to]] = [next[to], next[i]];
    setRows(next);
  };

  return (
    <div className="flex flex-col gap-7">
      <input type="hidden" name="siteShell" value={JSON.stringify(s)} />

      {errors.siteShell && (
        <p role="alert" className="text-sm text-primary">
          {errors.siteShell}
        </p>
      )}

      {/* Said once, here, instead of on every control. */}
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
        Everything below is empty until you change it. The greyed value in each field is what the
        store uses right now — clear a field to go back to it.
      </p>

      <Group
        label="Logo &amp; bar"
        changed={countSet(GROUP_KEYS.bar)}
        hint="the strip at the top of every page except the checkout — the colour also paints the mobile tab bar, which wears the same class"
      >
        <Sub label="The logo">
          <Row label="Height" {...revert("logoHeightDesktop", "logoHeightMobile")}>
            <Len value={s.logoHeightDesktop} onChange={(v) => patch({ logoHeightDesktop: v })} example="28px" desktop />
            <Len value={s.logoHeightMobile} onChange={(v) => patch({ logoHeightMobile: v })} example="28px" mobile />
          </Row>
          <Row label="With no logo" {...revert("brandFallback")}>
            <Seg
              label="With no logo"
              value={s.brandFallback}
              onChange={(v) => patch({ brandFallback: v })}
              defaultIs="the drawn mark"
              options={[
                ["mark", "Drawn mark"],
                ["name", "Store name"],
              ]}
            />
          </Row>
        </Sub>

        <Sub label="The bar">
          <Row label="Colour" {...revert("barColor")}>
            <Colour value={s.barColor} onChange={(v) => patch({ barColor: v })} />
          </Row>
          {s.barColor !== "" && (
            <Note>
              The links and the logo keep their own colours — set Colour, Hovered and Current page
              under Links to match, or a dark bar leaves the navigation unreadable.
            </Note>
          )}
          <Row label="Height" {...revert("barHeightDesktop", "barHeightMobile")}>
            <Len value={s.barHeightDesktop} onChange={(v) => patch({ barHeightDesktop: v })} example="65px" desktop />
            <Len value={s.barHeightMobile} onChange={(v) => patch({ barHeightMobile: v })} example="57px" mobile />
          </Row>
          <Row label="Width" {...revert("barWidth")}>
            <Seg
              label="Bar width"
              value={s.barWidth}
              onChange={(v) => patch({ barWidth: v })}
              defaultIs="match the page"
              options={[
                ["page", "Match page"],
                ["full", "Full width"],
              ]}
            />
          </Row>
          <Row label="Sticks to the top" {...revert("barSticky")}>
            <Switch value={s.barSticky} onChange={(v) => patch({ barSticky: v })} label="Sticks to the top" on="Yes" off="Scrolls away" defaultIs="yes" />
          </Row>
          <Row label="Bottom border" {...revert("barBorder")}>
            <Switch value={s.barBorder} onChange={(v) => patch({ barBorder: v })} label="Bottom border" on="Yes" off="No" defaultIs="yes" />
          </Row>
          <Row label="Translucent" {...revert("barTranslucent")}>
            <Switch value={s.barTranslucent} onChange={(v) => patch({ barTranslucent: v })} label="Translucent" on="Blurred" off="Solid" defaultIs="blurred" />
          </Row>
        </Sub>
      </Group>

      <Group
        label="Links"
        changed={countSet(GROUP_KEYS.links)}
        hint="the same list feeds the desktop bar and the mobile tabs — one nav, so the two can never disagree"
      >
        <Sub label="The links">
          {/* Column headings rather than placeholders alone: a row of two
              identical boxes is two identical boxes until something names
              them, and the placeholder disappears the moment you type. */}
          <div className="hidden gap-3 pl-8 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-muted sm:grid sm:grid-cols-[10rem_minmax(0,1fr)_5.5rem]">
            <span>Label</span>
            <span>Link</span>
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((l, i) => (
              <li key={i} className="flex flex-col gap-1">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_10rem_minmax(0,1fr)_5.5rem]">
                  <input
                    type="checkbox"
                    aria-label={`Show ${l.label || "this link"}`}
                    checked={l.on}
                    onChange={(e) => editRow(i, { on: e.target.checked })}
                    className="size-4 shrink-0 accent-[var(--primary)]"
                  />
                  <input
                    aria-label="Label"
                    value={l.label}
                    onChange={(e) => editRow(i, { label: e.target.value })}
                    placeholder="Label"
                    className={cell}
                  />
                  <input
                    aria-label="Link"
                    value={l.href}
                    onChange={(e) => editRow(i, { href: e.target.value })}
                    placeholder="/library"
                    className={`${cell} col-span-2 sm:col-span-1`}
                  />
                  <span className="col-span-2 flex items-center gap-1 sm:col-span-1 sm:justify-end">
                    <Small label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                      <Icon d="M8 3.5 3.5 8h3v4.5h3V8h3L8 3.5Z" />
                    </Small>
                    <Small label="Move down" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
                      <Icon d="M8 12.5 12.5 8h-3V3.5h-3V8h-3L8 12.5Z" />
                    </Small>
                    <Small label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      <Icon d="M4.4 3.6 8 7.2l3.6-3.6 1 1L9 8.2l3.6 3.6-1 1L8 9.2l-3.6 3.6-1-1L7 8.2 3.4 4.6l1-1Z" />
                    </Small>
                  </span>
                </div>
                {rowNote(l) && (
                  <span className="pl-8 text-[0.66rem] text-primary">{rowNote(l)}</span>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setRows([...rows, { label: "", href: "", on: true }])}
            className="mt-1 w-fit rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-fg"
          >
            Add a link
          </button>
        </Sub>

        <Sub label="How they look">
          <Row label="Size" {...revert("linkSizeDesktop", "linkSizeMobile")}>
            <Len value={s.linkSizeDesktop} onChange={(v) => patch({ linkSizeDesktop: v })} example="14px" desktop />
            <Len value={s.linkSizeMobile} onChange={(v) => patch({ linkSizeMobile: v })} example="11px" mobile />
          </Row>
          <Row label="Colour" {...revert("linkColor")}>
            <Colour value={s.linkColor} onChange={(v) => patch({ linkColor: v })} />
          </Row>
          <Row label="Hovered" {...revert("linkHoverColor")}>
            <Colour value={s.linkHoverColor} onChange={(v) => patch({ linkHoverColor: v })} />
          </Row>
          <Row label="Current page" {...revert("linkCurrentColor")}>
            <Colour value={s.linkCurrentColor} onChange={(v) => patch({ linkCurrentColor: v })} />
          </Row>
          <Row label="Current page is" {...revert("currentMark")}>
            <Seg
              label="Current page is"
              value={s.currentMark}
              onChange={(v) => patch({ currentMark: v })}
              defaultIs="a filled pill"
              options={[
                ["pill", "Filled pill"],
                ["underline", "Underlined"],
                ["none", "Not marked"],
              ]}
            />
          </Row>

          {/* Weight, case and letter spacing are set on roughly no store. They
              stay reachable and stop costing three rows of the panel to
              everyone who is here to change a colour. */}
          <Fold label="Letter spacing, weight and case" open={TYPE_DETAIL.some(isSet)}>
            <Row label="Weight" {...revert("linkWeight")}>
              <Seg
                label="Weight"
                value={s.linkWeight}
                onChange={(v) => patch({ linkWeight: v })}
                defaultIs="whatever the page uses"
                options={SHELL_WEIGHTS.map((w) => [w, w] as [string, string])}
              />
            </Row>
            <Row label="Case" {...revert("linkCase")}>
              <Seg
                label="Case"
                value={s.linkCase}
                onChange={(v) => patch({ linkCase: v })}
                defaultIs="as typed"
                // Each option is set in the case it applies, so the control is
                // its own preview. "none" is the default chip and needs no twin.
                options={SHELL_CASES.filter((c) => c !== "none").map(
                  (c) => [c, CASE_LABEL[c] ?? c] as [string, string],
                )}
              />
            </Row>
            <Row label="Letter spacing" {...revert("linkLetterSpacing")}>
              <Len value={s.linkLetterSpacing} onChange={(v) => patch({ linkLetterSpacing: v })} example="0.02em" />
            </Row>
          </Fold>
        </Sub>
      </Group>

      <Group
        label="Call to action"
        changed={countSet(GROUP_KEYS.cta)}
        hint="one button in the bar — left blank there isn't one, which is today"
      >
        <Rows>
        <Row label="Label" {...revert("ctaLabel")}>
          <input
            aria-label="Call to action label"
            value={s.ctaLabel}
            onChange={(e) => patch({ ctaLabel: e.target.value })}
            placeholder="None"
            className={cell}
          />
        </Row>
        <Row label="Link" {...revert("ctaHref")}>
          <input
            aria-label="Call to action link"
            value={s.ctaHref}
            onChange={(e) => patch({ ctaHref: e.target.value })}
            placeholder="/p/the-offer"
            className={cell}
          />
        </Row>
        {/* The same check the nav rows get. Without it `www.example.com` passes
            the panel, fails HREF on save, and the whole call to action
            disappears with nothing having said why. */}
        {!shellHrefIsValid(s.ctaHref) && (
          <Note tone="warn">Not a link this will keep — start with / or https://</Note>
        )}
        {s.ctaLabel !== "" && s.ctaHref !== "" && (
          <Row label="On mobile" {...revert("ctaOnMobile")}>
            <Switch value={s.ctaOnMobile} onChange={(v) => patch({ ctaOnMobile: v })} label="On mobile" on="Show it" off="Hide it" defaultIs="hidden" />
          </Row>
        )}
        {s.ctaLabel !== "" && s.ctaHref === "" && (
          <Note tone="warn">
            A label with no link is a button that goes nowhere, so nothing is shown until both are
            filled in.
          </Note>
        )}
        </Rows>
      </Group>

      <Group
        label="Mobile navigation"
        changed={countSet(GROUP_KEYS.mobile)}
        hint="how the links are reached on a phone"
      >
        <Rows>
        <Row label="Shown as" {...revert("mobileNav")}>
          <Seg
            label="Shown as"
            value={s.mobileNav}
            onChange={(v) => patch({ mobileNav: v })}
            defaultIs="tabs along the bottom"
            options={[
              ["tabs", "Bottom tabs"],
              ["menu", "Top menu"],
            ]}
          />
        </Row>
        {shellHasTabs(s) && (
          <Row label="Labels under the icons" {...revert("tabLabels")}>
            <Switch value={s.tabLabels} onChange={(v) => patch({ tabLabels: v })} label="Labels under the icons" on="Yes" off="Icons only" defaultIs="yes" />
          </Row>
        )}
        {!shellHasTabs(s) && (
          <Note>
            With no tab bar, the 6rem of bottom padding every page reserves for it goes too —
            otherwise every page on the site would end in six empty rems.
          </Note>
        )}
        </Rows>
      </Group>

      <Group
        label="Footer"
        changed={countSet(GROUP_KEYS.footer)}
        hint="the policy and social links stay whatever else is set here"
      >
        <Rows>
        <Row label="Logo height" {...revert("footerLogoHeight")}>
          <Len value={s.footerLogoHeight} onChange={(v) => patch({ footerLogoHeight: v })} example="20px" />
        </Row>
        <Row label="Your own line" {...revert("footerNote")}>
          <input
            aria-label="Footer note"
            value={s.footerNote}
            onChange={(e) => patch({ footerNote: e.target.value })}
            placeholder="© 2026 — nothing shown until you write something"
            className={cell}
          />
        </Row>
        </Rows>
      </Group>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel's parts
// ---------------------------------------------------------------------------

const cell =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted/70 focus:border-primary";

/**
 * Rows that belong together, for a group too small to need named parts.
 *
 * A `Group` spaces its children at the interval between sub-sections, which is
 * the right gap for "The logo" against "The bar" and much too wide for Label
 * against Link.
 */
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

/**
 * A labelled control, and a way back to the default.
 *
 * The control column is capped rather than stretched. A select reading "Yes"
 * was eight hundred pixels wide, which is a control the size of a decision it
 * is not — and thirty of them at that width is the wall this panel was.
 */
function Row({
  label,
  children,
  changed,
  onRevert,
}: {
  label: string;
  children: React.ReactNode;
  /** True when this row is no longer at its default. */
  changed?: boolean;
  onRevert?: () => void;
}) {
  return (
    // Three columns, not two: the revert gets a gutter of its own so it lands
    // in the same place on every row. Hung off the end of the control instead,
    // it sat wherever that control happened to stop — beside a colour swatch on
    // one row and half the panel away on the next.
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[9.5rem_minmax(0,26rem)_auto] sm:items-center sm:gap-4">
      <span className="flex items-center gap-1.5 text-xs text-fg/75">
        {label}
        {changed && <span aria-hidden className="size-1 shrink-0 rounded-full bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-2">{children}</span>
      {changed && onRevert ? (
        <button
          type="button"
          onClick={onRevert}
          // Not "Default": the segmented controls already have a chip by that
          // name meaning "use the default", and two adjacent controls sharing a
          // word while doing different things is worse than either alone.
          title={`Put ${label} back to the default`}
          className="w-fit shrink-0 text-[0.66rem] text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-fg"
        >
          Reset
        </button>
      ) : (
        <span aria-hidden />
      )}
    </div>
  );
}

/** An aside inside a group: an explanation, or a problem with what was typed. */
function Note({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" }) {
  return (
    <p
      className={`max-w-[62ch] text-[0.66rem] leading-relaxed ${
        tone === "warn" ? "text-primary" : "text-muted"
      }`}
    >
      {children}
    </p>
  );
}

/** Controls nobody sets, out of the way but never hidden. */
function Fold({
  label,
  open,
  children,
}: {
  label: string;
  /** Start open when something inside is already set — otherwise it is hidden. */
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="mt-1 border-t border-border/60 pt-2.5 [&[open]>summary>svg]:rotate-90">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-[0.7rem] text-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 16 16" aria-hidden className="size-2.5 fill-current transition-transform">
          <path d="M5 2.5 10.5 8 5 13.5V2.5Z" />
        </svg>
        {label}
      </summary>
      <div className="mt-2.5 flex flex-col gap-2">{children}</div>
    </details>
  );
}

/**
 * A length, as typed.
 *
 * The schema is an allow-list, so "28" with no unit is dropped on save. The
 * placeholder names the value the shell uses today, because "default" tells you
 * there is one and nothing about what it is.
 *
 * The width caption only appears where there are two of these side by side.
 * Letter spacing and the footer logo height are one value at every width, and
 * a control labelled "desktop" that also changes the phone is a control that
 * lies about what it does.
 */
function Len({
  value,
  onChange,
  example,
  mobile,
  desktop,
}: {
  value: string;
  onChange: (v: string) => void;
  example: string;
  mobile?: boolean;
  /** Set on the wider half of a pair. Unset means the value is not per width. */
  desktop?: boolean;
}) {
  const width = mobile ? "Phone" : desktop ? "Desktop" : "";
  return (
    <span className="flex min-w-[7.5rem] flex-1 items-center gap-1.5">
      {width && <span className="w-[3.6rem] shrink-0 text-[0.62rem] text-muted">{width}</span>}
      <input
        aria-label={width ? `${width} length` : "Length"}
        value={value}
        placeholder={example}
        onChange={(e) => onChange(e.target.value)}
        className={cell}
      />
    </span>
  );
}

/**
 * A short list of choices, all of them visible.
 *
 * These were `<select>`s stretched across the panel whose first option read
 * "Today: yes". Ten of them made the page a column of identical white bars you
 * had to open one at a time to read. Every set here is two to four choices, so
 * showing them costs less room than hiding them did — and which one is Default
 * is then visible at a glance down the whole panel.
 */
function Seg({
  value,
  onChange,
  options,
  label,
  defaultIs,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
  label: string;
  /** What leaving it alone actually does, named once, only while it applies. */
  defaultIs?: string;
}) {
  const all: readonly (readonly [string, string])[] = [["", "Default"], ...options];
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
      {defaultIs && value === "" && (
        <span className="text-[0.62rem] text-muted">{defaultIs}</span>
      )}
    </span>
  );
}

/** Three states, not two: unset is what the shell does today and has to stay reachable. */
function Switch({
  value,
  onChange,
  on,
  off,
  label,
  defaultIs,
}: {
  value: string;
  onChange: (v: string) => void;
  on: string;
  off: string;
  label: string;
  /** The default in words — "yes", "blurred", "hidden". */
  defaultIs: string;
}) {
  return (
    <Seg
      label={label}
      value={value}
      onChange={onChange}
      defaultIs={defaultIs}
      options={[
        ["on", on],
        ["off", off],
      ]}
    />
  );
}

/**
 * A colour, as typed.
 *
 * `red`, `rgb(0,0,0)` and `#ff000080` are all dropped on save by
 * `normalizeHex`, so the panel says so while it is being typed — the check is
 * that same function, so the two cannot disagree. The swatch is dimmed while
 * nothing is set: a solid black square next to an empty field reads as "black
 * is the colour", not as "no colour".
 */
function Colour({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const set = value.trim() !== "";
  const bad = set && !colorIsValid(value);
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex items-center gap-2">
        {/* The picker and the text write the same value, because a hex you can
            paste matters as much as one you can point at. */}
        <input
          type="color"
          aria-label="Colour picker"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className={`size-7 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1 ${
            set ? "" : "opacity-40"
          }`}
        />
        <input
          aria-label="Colour"
          value={value}
          placeholder="Inherit"
          onChange={(e) => onChange(e.target.value)}
          className={`${cell} max-w-[9rem]`}
        />
      </span>
      {bad && (
        <span className="text-[0.66rem] text-primary">
          Not a colour — dropped on save. Try #c8653d.
        </span>
      )}
    </span>
  );
}

/** A drawn glyph, not a typed one: ↑ and × are text pretending to be icons. */
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3 fill-current">
      <path d={d} />
    </svg>
  );
}

function Small({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 shrink-0 place-items-center rounded-lg border border-border text-muted transition-colors enabled:hover:border-primary enabled:hover:text-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}
