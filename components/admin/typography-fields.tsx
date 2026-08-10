"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { useFormStatus } from "react-dom";
import { inputClass as input, Field, Group } from "@/components/admin/form-controls";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { DeviceSwitch } from "@/components/admin/device-switch";
import { DEVICE_CANVAS, type Device } from "@/lib/blocks";
import { HEADING_SIZE } from "@/lib/block-style";
import {
  PREVIEW_SCOPE,
  SITE_TYPOGRAPHY_DEFAULTS,
  TYPOGRAPHY_DECORATIONS,
  TYPOGRAPHY_ELEMENTS,
  TYPOGRAPHY_STYLES,
  TYPOGRAPHY_TRANSFORMS,
  TYPOGRAPHY_WEIGHTS,
  colorIsValid,
  metricIsValid,
  normalizeSiteTypography,
  siteTypographyCssAt,
  type SiteTypography,
  type TypographyElement,
  type TypographyMetrics,
  type TypographyStyle,
} from "@/lib/site-typography";
import {
  installGoogleFontAction,
  uploadFontAction,
  removeFontAction,
  type FontState,
} from "@/app/admin/settings/font-actions";
import { GOOGLE_FONTS, FONT_WEIGHTS } from "@/lib/fonts-catalogue";

/**
 * Which typefaces the store uses, and which it has.
 *
 * Two halves. The top one is the decision — heading and body — and it only
 * offers what is actually installed, because a family name with no files
 * behind it silently renders as the fallback and looks like a bug in the page
 * rather than a gap in the settings.
 *
 * The bottom half is the library. A Google font is DOWNLOADED when it is
 * chosen and served from this site afterwards, so no visitor's browser ever
 * talks to Google — that is a privacy commitment, not a speed trick, and the
 * panel says so rather than leaving it to be discovered.
 */
export type InstalledFont = { id: string; family: string; source: "google" | "custom"; count: number };

export function TypographyFields({
  headingFont,
  bodyFont,
  siteTypography,
  installed,
  errors,
}: {
  headingFont: string;
  bodyFont: string;
  /**
   * The site's own type scale — eleven elements at three widths.
   *
   * One JSON field rather than forty inputs, the way the page editor posts a
   * section's blocks. The panel below holds it in state and the hidden input
   * carries whatever the state currently says.
   */
  siteTypography: SiteTypography;
  installed: InstalledFont[];
  errors: Record<string, string>;
}) {
  const families = installed.map((f) => f.family);
  // Held in state so the specimen changes as you choose, rather than after a
  // save — the whole question here is "what does that one look like".
  const [heading, setHeading] = useState(headingFont);
  const [body, setBody] = useState(bodyFont);
  // Normalised on the way in so the panel edits the same shape the save will
  // parse: a store whose blob predates a field would otherwise put `undefined`
  // into an input and turn it uncontrolled halfway through a session.
  const [type, setType] = useState<SiteTypography>(() => normalizeSiteTypography(siteTypography));
  const [el, setEl] = useState<TypographyElement>("body");
  const [device, setDevice] = useState<Device>("desktop");

  const style = type[el];
  const patch = (p: Partial<TypographyStyle>) => setType({ ...type, [el]: { ...style, ...p } });
  const patchMetrics = (p: Partial<TypographyMetrics>) =>
    patch({ [device]: { ...style[device], ...p } });

  return (
    <>
      <input type="hidden" name="siteTypography" value={JSON.stringify(type)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Heading font" hint="titles, and anything set in the display face" error={errors.headingFont}>
          <FontSelect name="headingFont" value={heading} families={families} onChange={setHeading} />
        </Field>
        <Field label="Body font" hint="paragraphs, labels, buttons" error={errors.bodyFont}>
          <FontSelect name="bodyFont" value={body} families={families} onChange={setBody} />
        </Field>
      </div>

      {errors.siteTypography && (
        <p role="alert" className="text-sm text-primary">
          {errors.siteTypography}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[8.5rem_minmax(0,1fr)]">
        <ElementRail element={el} onChange={setEl} type={type} />

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{ELEMENT_LABEL[el]}</span>
            <span className="flex items-center gap-2">
              <DeviceSwitch device={device} onChange={setDevice} />
              <button
                type="button"
                disabled={!isSet(type, el)}
                onClick={() => setType({ ...type, [el]: SITE_TYPOGRAPHY_DEFAULTS[el] })}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-fg disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted"
              >
                Reset {ELEMENT_LABEL[el]}
              </button>
            </span>
          </div>

          {UNSTYLED.includes(el) && (
            <p className="rounded-r-lg border-l-2 border-primary bg-primary/5 px-3 py-2 text-xs text-primary">
              Nothing outside a sales page styles {el} today — h5 and h6 are the two heading levels
              app/globals.css leaves alone. A heading block set to {el} does have a size of its own
              ({HEADING_SIZE[el as "h5"]}), and a size set here replaces it.
            </p>
          )}

          {SCOPE_NOTE[el] && <p className="text-xs text-muted">{SCOPE_NOTE[el]}</p>}

          <Group
            label="Every width"
            hint="one value each — a typeface that changed on a phone would not be the site's typeface"
          >
            <Line label="Family">
              <Pick
                label="Family"
                value={style.family}
                onChange={(v) => patch({ family: v })}
                options={families}
                inherit={
                  isHeading(el)
                    ? `Heading font — ${heading || "Inter"}`
                    : `Body font — ${body || "Poppins"}`
                }
              />
            </Line>
            <Line label="Weight">
              <Pick
                label="Weight"
                value={style.weight}
                onChange={(v) => patch({ weight: v })}
                options={TYPOGRAPHY_WEIGHTS}
                inherit="Inherit"
              />
            </Line>
            <Line label="Style">
              <Pick
                label="Style"
                value={style.style}
                onChange={(v) => patch({ style: v })}
                options={TYPOGRAPHY_STYLES}
                inherit="Inherit"
              />
            </Line>
            <Line label="Case">
              <Pick
                label="Case"
                value={style.transform}
                onChange={(v) => patch({ transform: v })}
                options={TYPOGRAPHY_TRANSFORMS}
                inherit="Inherit"
              />
            </Line>
            <Line label="Decoration">
              <Pick
                label="Decoration"
                value={style.decoration}
                onChange={(v) => patch({ decoration: v })}
                options={TYPOGRAPHY_DECORATIONS}
                inherit="Inherit"
              />
            </Line>
            <Line label="Colour">
              <Colour value={style.color} onChange={(v) => patch({ color: v })} />
            </Line>
          </Group>

          {/* A hover state gets no measurements. `:root a:hover{font-size}`
              reflows the line under the cursor as you point at it — the one
              thing this group could offer that nobody could want. */}
          {el === "linkHover" ? (
            <p className="text-xs text-muted">
              A hover state changes colour, weight and decoration only — a size or a line height
              here would reflow the text under the cursor.
            </p>
          ) : (
          <Group
            label={`${DEVICE_LABEL[device]} only`}
            hint="size, line height, letter spacing and word spacing are the only four a width may change"
          >
            <Metric
              label="Size"
              field="size"
              example="18px"
              value={style[device].size}
              onChange={(v) => patchMetrics({ size: v })}
            />
            <Metric
              label="Line height"
              field="lineHeight"
              example="1.5"
              value={style[device].lineHeight}
              onChange={(v) => patchMetrics({ lineHeight: v })}
            />
            <Metric
              label="Letter spacing"
              field="letterSpacing"
              example="-0.01em"
              value={style[device].letterSpacing}
              onChange={(v) => patchMetrics({ letterSpacing: v })}
            />
            <Metric
              label="Word spacing"
              field="wordSpacing"
              example="0.02em"
              value={style[device].wordSpacing}
              onChange={(v) => patchMetrics({ wordSpacing: v })}
            />
            {/* Written onto `p`, not onto `body`: margin-bottom does not
                inherit, so it is the one body measurement that has to name the
                element it applies to. It is offered on Body alone for that
                reason. */}
            {el === "body" && (
              <Metric
                label="Paragraph gap"
                field="paragraphSpacing"
                example="1rem"
                value={style[device].paragraphSpacing}
                onChange={(v) => patchMetrics({ paragraphSpacing: v })}
              />
            )}
          </Group>
          )}
        </div>
      </div>

      <Specimen heading={heading} body={body} type={type} device={device} element={el} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The panel's parts
// ---------------------------------------------------------------------------

const ELEMENT_LABEL: Record<TypographyElement, string> = {
  body: "Body",
  link: "Link",
  linkHover: "Link, hovered",
  list: "Lists",
  blockquote: "Quote",
  h1: "H1",
  h2: "H2",
  h3: "H3",
  h4: "H4",
  h5: "H5",
  h6: "H6",
};

const DEVICE_LABEL: Record<Device, string> = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" };

/**
 * The two heading levels this site has never styled.
 *
 * `app/globals.css` styles h1 to h4 and stops. An h5 is whatever the browser
 * and whichever block drew it decided between them. That is the reason they
 * are in this list rather than a reason to leave them out — but somebody
 * setting one should know they are the first person ever to.
 */
const UNSTYLED: readonly TypographyElement[] = ["h5", "h6"];

/**
 * What an element actually reaches, where the label understates it.
 *
 * These are rules on tags, not on classes — that is what makes them reach a
 * page written next year without being told about it, and it is also what makes
 * "Link" mean every `<a>` on the store rather than the ones inside a paragraph.
 * Somebody underlining links should know the buttons drawn as links go with
 * them, before they save it and go looking for the store's checkout button.
 */
const SCOPE_NOTE: Partial<Record<TypographyElement, string>> = {
  link: "Every link on the store — navigation, footer, product cards, and the buttons drawn as links. A decoration set here underlines those too.",
  linkHover: "Every link on the store while the pointer is over it.",
  body: "The page's base. A sales band paints its own ink, so a colour set here reaches the shell, library, checkout and legal pages but not a product or offer page.",
};

const isHeading = (el: string) => /^h[1-6]$/.test(el);

/** Whether an element has been given anything at all. Drives the rail's dot and Reset. */
function isSet(type: SiteTypography, el: TypographyElement): boolean {
  return JSON.stringify(type[el]) !== JSON.stringify(SITE_TYPOGRAPHY_DEFAULTS[el]);
}

/**
 * What can be styled, and what already has been.
 *
 * The dot is the only way to see that something was set on h4 two months ago
 * without opening all eleven — which is the same reason the settings screen
 * itself puts one on Legal.
 */
function ElementRail({
  element,
  onChange,
  type,
}: {
  element: TypographyElement;
  onChange: (el: TypographyElement) => void;
  type: SiteTypography;
}) {
  return (
    <nav
      aria-label="What to style"
      className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface-2 p-1 md:flex-col md:overflow-visible"
    >
      {TYPOGRAPHY_ELEMENTS.map((el) => {
        const on = el === element;
        return (
          <button
            key={el}
            type="button"
            onClick={() => onChange(el)}
            aria-current={on ? "true" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
              on ? "bg-surface font-medium text-primary" : "text-muted hover:text-fg"
            } ${el === "linkHover" ? "md:pl-5" : ""}`}
          >
            {ELEMENT_LABEL[el]}
            {UNSTYLED.includes(el) && (
              <span aria-label="unstyled on this site" title="Nothing styles this today" className="text-primary">
                *
              </span>
            )}
            {isSet(type, el) && (
              <span aria-label="something set" className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

const cell =
  "w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-primary";

function Line({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <label className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex flex-col gap-1">
        {children}
        {note && <span className="text-[0.66rem] text-primary">{note}</span>}
      </span>
    </label>
  );
}

function Pick({
  label,
  value,
  onChange,
  options,
  inherit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  inherit: string;
}) {
  // A value with no option to match it makes a <select> show its FIRST option
  // while state keeps the real one — so the panel reads "inherit" while the
  // page renders a fallback. Happens whenever a font is removed from the
  // library after something was set to it.
  const missing = value !== "" && !options.includes(value);
  return (
    <>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cell}>
        <option value="">{inherit}</option>
        {missing && <option value={value}>{value} — not installed</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {missing && (
        <span className="text-[0.66rem] text-primary">
          {value} is no longer in the library, so this renders as the fallback. Add it back or
          choose another.
        </span>
      )}
    </>
  );
}

/**
 * A length, as typed.
 *
 * The schema is an allow-list, so a size of "18" with no unit is silently
 * dropped on save. Saying so while it is being typed is the difference between
 * a setting that does nothing and a setting you know does nothing — and the
 * check is the schema's own, so the two cannot disagree.
 */
function Metric({
  label,
  field,
  example,
  value,
  onChange,
}: {
  label: string;
  field: keyof TypographyMetrics;
  example: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const bad = value.trim() !== "" && !metricIsValid(field, value);
  return (
    <Line label={label} note={bad ? `Not a length — dropped on save. Try ${example}.` : undefined}>
      <input
        aria-label={label}
        value={value}
        placeholder={`Inherit — e.g. ${example}`}
        onChange={(e) => onChange(e.target.value)}
        className={cell}
      />
    </Line>
  );
}

/**
 * A colour, as typed.
 *
 * `red`, `rgb(0,0,0)` and `#ff000080` are all dropped on save by `normalizeHex`,
 * so this says so while it is being typed — through that same function, the way
 * `Metric` goes through the schema's own regexes. The swatch is dimmed while
 * nothing is set: a solid black square beside an empty field reads as "black".
 */
function Colour({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const set = value.trim() !== "";
  const bad = set && !colorIsValid(value);
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        {/* The picker and the text write the same value, because a hex you can
            paste matters as much as one you can point at. */}
        <input
          type="color"
          aria-label="Colour picker"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className={`size-8 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1 ${
            set ? "" : "opacity-40"
          }`}
        />
        <input
          aria-label="Colour"
          value={value}
          placeholder="Inherit"
          onChange={(e) => onChange(e.target.value)}
          className={cell}
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

/**
 * The store as it renders today, before anything below it is set.
 *
 * Tailwind's preflight sets every heading to `font-size:inherit`, so a
 * specimen with no site size would draw an h1 at body size and read as a bug
 * in the panel rather than an unset setting. These are the sizes a heading
 * block actually renders at, imported rather than retyped. Same specificity as
 * the rules appended after them, so anything genuinely set wins on source
 * order.
 *
 * Family is deliberately absent: `app/globals.css` gives h1–h4 the heading
 * face and gives h5 and h6 nothing, and the specimen has to show that.
 */
const SPECIMEN_BASE = [
  `.${PREVIEW_SCOPE}{font-family:var(--font-body),system-ui,sans-serif}`,
  ...Object.entries(HEADING_SIZE).map(([tag, size]) => `.${PREVIEW_SCOPE} ${tag}{font-size:${size}}`),
  `.${PREVIEW_SCOPE} ul{list-style:disc;padding-left:1.4em}`,
  `.${PREVIEW_SCOPE} blockquote{border-left:2px solid currentColor;padding-left:1em}`,
].join("");

/**
 * What is set, drawn in what is set.
 *
 * A dropdown reading "Lora" tells you the name and nothing else — and when it
 * reads "Built in" it does not even tell you that much. The only real question
 * about a typeface is what it looks like next to the other one, and the only
 * real question about a size is whether it is too big.
 *
 * Written at one width with no media queries, the way the builder canvas is:
 * this box is a few hundred pixels wide inside a full window, so a
 * `max-width:767px` query would never match here and the mobile view would
 * show the desktop type — a preview lying about the one thing it was asked
 * to show.
 *
 * The settings page declares the @font-face rules for everything installed —
 * declarations only, no `:root` override — so the sample is the real face and
 * a font that fails to load still cannot disturb the admin around it. The two
 * family variables are declared here on the specimen alone for the same
 * reason.
 */
function Specimen({
  heading,
  body,
  type,
  device,
  element,
}: {
  heading: string;
  body: string;
  type: SiteTypography;
  device: Device;
  element: TypographyElement;
}) {
  const Tag = (isHeading(element) ? element : "h2") as "h1";
  const vars = {
    "--font-heading": heading ? `"${heading}", system-ui, sans-serif` : undefined,
    "--font-body": body ? `"${body}", system-ui, sans-serif` : undefined,
  } as CSSProperties;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="kicker text-muted">Specimen</span>
        <span className="text-xs text-muted">
          Headings in <b className="font-medium text-fg">{heading || "Inter"}</b>
          {!heading && " (built in)"} · body in <b className="font-medium text-fg">{body || "Poppins"}</b>
          {!body && " (built in)"} · at {DEVICE_LABEL[device].toLowerCase()} width
        </span>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: SPECIMEN_BASE + siteTypographyCssAt(type, device, `.${PREVIEW_SCOPE}`),
        }}
      />
      {/* ponytail: the box narrows with the switch, but `vw` inside a clamp
          still measures the window — h1's default size is the one place that
          shows. Swap the clamps for container query units if it matters. */}
      <div
        className={`${PREVIEW_SCOPE} flex flex-col gap-2 overflow-x-auto text-fg`}
        style={{ ...vars, maxWidth: DEVICE_CANVAS[device] ?? undefined }}
      >
        <Tag>The quick brown fox jumps</Tag>
        <p>
          Body copy looks like this — 0123456789, long enough to show the rhythm of the letters
          rather than just their shapes, and with <a>a link</a> inside it.
        </p>
        <p>A second paragraph, so the gap between two of them is a thing you can see.</p>
        <ul>
          <li>One item in a list</li>
          <li>And another under it</li>
        </ul>
        <blockquote>And a line worth quoting, set the way a quote is set.</blockquote>
      </div>
    </div>
  );
}

function FontSelect({
  name,
  value,
  families,
  onChange,
}: {
  name: string;
  value: string;
  families: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">
        {name === "headingFont" ? "Inter — built in" : "Poppins — built in"}
      </option>
      {families.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
  );
}

/**
 * The library, rendered OUTSIDE the settings group's form.
 *
 * Adding a font and removing one are forms of their own, and a form inside a
 * form is not a thing HTML has — the inner one is dropped and its button
 * submits the outer one, which would save the settings group instead of
 * uploading the file.
 */
export function FontLibrary({ installed }: { installed: InstalledFont[] }) {
  const [tab, setTab] = useState<"google" | "custom">("google");

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="kicker text-muted">Fonts on this site</span>
        <p className="text-xs text-muted">
          Served from this site, never from Google — so no visitor&rsquo;s browser is handed to a
          third party before your cookie banner has said a word.
        </p>
      </div>

      {installed.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {installed.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm" style={{ fontFamily: `"${f.family}", inherit` }}>
                  {f.family}
                </span>
                <span className="text-[0.66rem] text-muted">
                  {f.source === "google" ? "Google, self-hosted" : "Uploaded"} · {f.count} file
                  {f.count === 1 ? "" : "s"}
                </span>
              </span>
              <form action={removeFontAction}>
                <input type="hidden" name="id" value={f.id} />
                <ConfirmSubmit
                  label="Remove"
                  confirmLabel="Remove — any page using it falls back"
                  cancelLabel="Keep it"
                  kind="remove"
                />
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">
          Nothing added yet, so the site uses the two fonts it was built with.
        </p>
      )}

      <div className="flex gap-1 border-b border-border" role="tablist">
        {(
          [
            ["google", "Add a Google font"],
            ["custom", "Upload your own"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-3 py-1.5 text-xs transition-colors ${
              tab === key ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "google" ? <AddGoogle /> : <AddCustom />}
    </div>
  );
}

function AddGoogle() {
  const [state, action] = useActionState<FontState, FormData>(installGoogleFontAction, {});
  return (
    /* Its own form, nested nowhere: the settings group around this is a form
       too, and a form inside a form is not a thing HTML has. */
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
        <span className="text-xs text-muted">Family</span>
        <select name="family" className={input} defaultValue="">
          <option value="" disabled>
            Choose a font…
          </option>
          {GOOGLE_FONTS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <Submit label="Download it" busy="Downloading…" />
      <Result state={state} />
    </form>
  );
}

function AddCustom() {
  const [state, action] = useActionState<FontState, FormData>(uploadFontAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 flex flex-col gap-1.5">
          <span className="text-xs text-muted">Family name</span>
          <input name="family" placeholder="Founders Grotesk" className={input} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Weight</span>
          <select name="weight" defaultValue="400" className={input}>
            {[100, 200, 300, ...FONT_WEIGHTS, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Style</span>
          <select name="style" defaultValue="normal" className={input}>
            <option value="normal">Upright</option>
            <option value="italic">Italic</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted">File</span>
        <input type="file" name="file" accept=".woff2,.woff,.ttf,.otf" className={input} />
      </label>
      <p className="text-[0.66rem] text-muted">
        One file per weight and style. Add the same family again for each one — bold and italic are
        separate files, and a browser asked for a bold it does not have will smear the regular
        instead.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Add the file" busy="Uploading…" />
        <Result state={state} />
      </div>
    </form>
  );
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:border-primary disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  );
}

function Result({ state }: { state: FontState }) {
  if (state.error) {
    return (
      <span role="alert" className="text-xs text-primary">
        {state.error}
      </span>
    );
  }
  if (state.message) {
    return (
      <span role="status" className="text-xs text-navy">
        {state.message}
      </span>
    );
  }
  return null;
}
