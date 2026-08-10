"use client";

import { useState } from "react";
import { Group } from "@/components/admin/form-controls";
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

/**
 * The header, the navigation and the footer.
 *
 * One JSON field rather than thirty inputs, the way the Typography panel and
 * the page editor both post. Every control offers "Default" first and means it:
 * leaving the whole panel alone is the same store it was before the panel
 * existed, and every label here names what that default actually is rather
 * than saying "default" and leaving you to go and look.
 */
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

  // The links as the editor shows them: the three built-in ones until somebody
  // touches something, at which point the whole list is written down.
  const rows: readonly ShellLink[] = s.links.length > 0 ? s.links : SHELL_DEFAULT_LINKS;
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
    <>
      <input type="hidden" name="siteShell" value={JSON.stringify(s)} />

      {errors.siteShell && (
        <p role="alert" className="text-sm text-primary">
          {errors.siteShell}
        </p>
      )}

      <Group label="Logo & bar" hint="the strip at the top of every page except the checkout">
        <Row label="Logo height">
          <Len value={s.logoHeightDesktop} onChange={(v) => patch({ logoHeightDesktop: v })} example="28px" />
          <Len value={s.logoHeightMobile} onChange={(v) => patch({ logoHeightMobile: v })} example="28px" mobile />
        </Row>
        <Row label="With no logo">
          <Pick
            value={s.brandFallback}
            onChange={(v) => patch({ brandFallback: v })}
            options={[
              ["", "The drawn mark"],
              ["mark", "The drawn mark"],
              ["name", "The store name, as text"],
            ]}
          />
        </Row>
        <Row label="Bar colour">
          <Colour value={s.barColor} onChange={(v) => patch({ barColor: v })} />
        </Row>
        <Row label="Translucent">
          <Switch value={s.barTranslucent} onChange={(v) => patch({ barTranslucent: v })} on="Yes, blurred" off="No, solid" />
        </Row>
        <Row label="Sticks to the top">
          <Switch value={s.barSticky} onChange={(v) => patch({ barSticky: v })} on="Yes" off="No, scrolls away" />
        </Row>
        <Row label="Bottom border">
          <Switch value={s.barBorder} onChange={(v) => patch({ barBorder: v })} on="Yes" off="No" />
        </Row>
        <Row label="Bar height">
          <Len value={s.barHeightDesktop} onChange={(v) => patch({ barHeightDesktop: v })} example="65px" />
          <Len value={s.barHeightMobile} onChange={(v) => patch({ barHeightMobile: v })} example="57px" mobile />
        </Row>
        <Row label="Bar width">
          <Pick
            value={s.barWidth}
            onChange={(v) => patch({ barWidth: v })}
            options={[
              ["", "Match the page"],
              ["page", "Match the page"],
              ["full", "Full width"],
            ]}
          />
        </Row>
      </Group>

      <Group
        label="Links"
        hint="the same list feeds the desktop bar and the mobile tabs — one nav, so the two can never disagree"
      >
        <ul className="flex flex-col gap-2">
          {rows.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Show ${l.label || "this link"}`}
                checked={l.on}
                onChange={(e) => editRow(i, { on: e.target.checked })}
                className="size-4 shrink-0"
              />
              <input
                aria-label="Label"
                value={l.label}
                onChange={(e) => editRow(i, { label: e.target.value })}
                placeholder="Label"
                className={`${cell} w-28`}
              />
              <input
                aria-label="Link"
                value={l.href}
                onChange={(e) => editRow(i, { href: e.target.value })}
                placeholder="/library"
                className={`${cell} min-w-[9rem] flex-1`}
              />
              <span className="flex items-center gap-1">
                <Small label="Move up" onClick={() => move(i, -1)}>↑</Small>
                <Small label="Move down" onClick={() => move(i, 1)}>↓</Small>
                <Small label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  ×
                </Small>
              </span>
              {!shellHrefIsValid(l.href) && (
                <span className="w-full text-[0.66rem] text-primary">
                  Not a link this will keep — start with / or https://
                </span>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setRows([...rows, { label: "", href: "", on: true }])}
          className="w-fit rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-fg"
        >
          Add a link
        </button>
        <Row label="Size">
          <Len value={s.linkSizeDesktop} onChange={(v) => patch({ linkSizeDesktop: v })} example="14px" />
          <Len value={s.linkSizeMobile} onChange={(v) => patch({ linkSizeMobile: v })} example="11px" mobile />
        </Row>
        <Row label="Weight">
          <Pick
            value={s.linkWeight}
            onChange={(v) => patch({ linkWeight: v })}
            options={[["", "Inherit"], ...SHELL_WEIGHTS.map((w) => [w, w] as [string, string])]}
          />
        </Row>
        <Row label="Case">
          <Pick
            value={s.linkCase}
            onChange={(v) => patch({ linkCase: v })}
            options={[["", "Inherit"], ...SHELL_CASES.map((c) => [c, c] as [string, string])]}
          />
        </Row>
        <Row label="Letter spacing">
          <Len value={s.linkLetterSpacing} onChange={(v) => patch({ linkLetterSpacing: v })} example="0.02em" />
        </Row>
        <Row label="Colour">
          <Colour value={s.linkColor} onChange={(v) => patch({ linkColor: v })} />
        </Row>
        <Row label="Hovered">
          <Colour value={s.linkHoverColor} onChange={(v) => patch({ linkHoverColor: v })} />
        </Row>
        <Row label="Current page">
          <Colour value={s.linkCurrentColor} onChange={(v) => patch({ linkCurrentColor: v })} />
        </Row>
        <Row label="Current page is">
          <Pick
            value={s.currentMark}
            onChange={(v) => patch({ currentMark: v })}
            options={[
              ["", "A filled pill"],
              ["pill", "A filled pill"],
              ["underline", "Underlined"],
              ["none", "Not marked"],
            ]}
          />
        </Row>
      </Group>

      <Group label="Call to action" hint="one button in the bar — left blank there isn't one, which is today">
        <Row label="Label">
          <input
            aria-label="Call to action label"
            value={s.ctaLabel}
            onChange={(e) => patch({ ctaLabel: e.target.value })}
            placeholder="None"
            className={cell}
          />
        </Row>
        <Row label="Link">
          <input
            aria-label="Call to action link"
            value={s.ctaHref}
            onChange={(e) => patch({ ctaHref: e.target.value })}
            placeholder="/p/the-offer"
            className={cell}
          />
        </Row>
        <Row label="On mobile">
          <Switch value={s.ctaOnMobile} onChange={(v) => patch({ ctaOnMobile: v })} on="Show it" off="Hide it" defaultIs="off" />
        </Row>
        {s.ctaLabel !== "" && s.ctaHref === "" && (
          <p className="text-[0.66rem] text-primary">
            A label with no link is a button that goes nowhere, so nothing is shown until both are
            filled in.
          </p>
        )}
      </Group>

      <Group label="Mobile navigation" hint="how the links are reached on a phone">
        <Row label="Shown as">
          <Pick
            value={s.mobileNav}
            onChange={(v) => patch({ mobileNav: v })}
            options={[
              ["", "Tabs along the bottom"],
              ["tabs", "Tabs along the bottom"],
              ["menu", "A menu in the top bar"],
            ]}
          />
        </Row>
        <Row label="Labels under the icons">
          <Switch value={s.tabLabels} onChange={(v) => patch({ tabLabels: v })} on="Yes" off="No, icons only" />
        </Row>
        {!shellHasTabs(s) && (
          <p className="text-[0.66rem] text-muted">
            With no tab bar, the 6rem of bottom padding every page reserves for it goes too —
            otherwise every page on the site would end in six empty rems.
          </p>
        )}
      </Group>

      <Group label="Footer" hint="the policy and social links stay whatever else is set here">
        <Row label="Logo height">
          <Len value={s.footerLogoHeight} onChange={(v) => patch({ footerLogoHeight: v })} example="20px" />
        </Row>
        <Row label="Your own line">
          <input
            aria-label="Footer note"
            value={s.footerNote}
            onChange={(e) => patch({ footerNote: e.target.value })}
            placeholder="© 2026 — nothing shown until you write something"
            className={cell}
          />
        </Row>
      </Group>
    </>
  );
}

// ---------------------------------------------------------------------------
// The panel's parts
// ---------------------------------------------------------------------------

const cell =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-primary";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex flex-wrap items-center gap-2">{children}</span>
    </div>
  );
}

/**
 * A length, as typed.
 *
 * The schema is an allow-list, so "28" with no unit is dropped on save. The
 * placeholder names the value the shell uses today, because "default" tells
 * you there is one and nothing about what it is.
 */
function Len({
  value,
  onChange,
  example,
  mobile,
}: {
  value: string;
  onChange: (v: string) => void;
  example: string;
  mobile?: boolean;
}) {
  return (
    <span className="flex min-w-[8rem] flex-1 items-center gap-1.5">
      <span className="text-[0.66rem] uppercase tracking-wider text-muted">
        {mobile ? "phone" : "desktop"}
      </span>
      <input
        aria-label={`${mobile ? "Mobile" : "Desktop"} length`}
        value={value}
        placeholder={`Today: ${example}`}
        onChange={(e) => onChange(e.target.value)}
        className={cell}
      />
    </span>
  );
}

function Pick({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${cell} flex-1`}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Three states, not two: unset is what the shell does today and has to stay reachable. */
function Switch({
  value,
  onChange,
  on,
  off,
  defaultIs = "on",
}: {
  value: string;
  onChange: (v: string) => void;
  on: string;
  off: string;
  defaultIs?: "on" | "off";
}) {
  return (
    <Pick
      value={value}
      onChange={onChange}
      options={[
        ["", `Today: ${defaultIs === "on" ? on.toLowerCase() : off.toLowerCase()}`],
        ["on", on],
        ["off", off],
      ]}
    />
  );
}

function Colour({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="flex flex-1 items-center gap-2">
      {/* The picker and the text write the same value, because a hex you can
          paste matters as much as one you can point at. */}
      <input
        type="color"
        aria-label="Colour picker"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="size-8 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
      />
      <input
        aria-label="Colour"
        value={value}
        placeholder="Inherit"
        onChange={(e) => onChange(e.target.value)}
        className={cell}
      />
    </span>
  );
}

function Small({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-7 shrink-0 place-items-center rounded-lg border border-border text-xs text-muted transition-colors hover:border-primary hover:text-fg"
    >
      {children}
    </button>
  );
}
