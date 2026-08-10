import { SETTINGS_DEFAULTS, type Settings } from "@/lib/settings-schema";
import { fontFaceCss, familyStack, type FontRow } from "@/lib/fonts";
import { inlineCss, inlineJs, siteTypographyCss } from "@/lib/site-typography";

/**
 * The saved brand, as real CSS.
 *
 * The colours are theme variables, so overriding `--primary` here reaches every
 * button, link and accent on the store without any component knowing settings
 * exist. `--primary-hover` is derived rather than asked for: a second colour
 * picker for "the same colour but slightly darker" is a question with one right
 * answer, and `color-mix` knows it.
 *
 * Nothing is emitted when a value still equals its default, so the common case
 * ships no extra bytes and the stylesheet stays the single source.
 *
 * The custom CSS and JS are the store owner's own, entered in the admin behind
 * `requireAdmin`. They are deliberately NOT rendered in the admin itself — a
 * snippet that breaks every page it is on must leave one page working, and that
 * page is the one with the box you remove it from.
 */
export function StoreBrand({
  settings,
  fonts = [],
  publicBase = "",
}: {
  settings: Settings;
  /** Everything installed, so any face a block asks for is declared. */
  fonts?: FontRow[];
  /** Where the files are served from — our own origin, never Google's. */
  publicBase?: string;
}) {
  const rules: string[] = [];

  if (settings.primaryColor !== SETTINGS_DEFAULTS.primaryColor) {
    rules.push(
      `--primary:${settings.primaryColor}`,
      `--primary-hover:color-mix(in srgb, ${settings.primaryColor} 82%, black)`,
    );
  }
  if (settings.deepColor !== SETTINGS_DEFAULTS.deepColor) {
    rules.push(`--navy:${settings.deepColor}`);
  }
  // The two names the whole stylesheet asks for. Left alone, they keep the
  // fonts the app was built with.
  if (settings.headingFont) {
    rules.push(`--font-heading:${familyStack(settings.headingFont, "system-ui, sans-serif")}`);
  }
  if (settings.bodyFont) {
    rules.push(`--font-body:${familyStack(settings.bodyFont, "system-ui, sans-serif")}`);
  }

  const css = [
    // Faces first: a rule that names a family before its @font-face is declared
    // is a rule the browser resolves to the fallback.
    fonts.length > 0 ? fontFaceCss(fonts, publicBase) : "",
    // The site's own type, before the variables it reads and before the owner's
    // CSS, which must be able to beat both. Empty until somebody sets something.
    siteTypographyCss(settings.siteTypography),
    rules.length > 0 ? `:root{${rules.join(";")}}` : "",
    // Only the owner's half is treated: everything above it is written by this
    // codebase out of schema-cleaned values, so passing it through as well
    // would be a no-op that reads like a doubt.
    inlineCss(settings.customCss.trim()),
  ]
    .filter(Boolean)
    .join("\n");

  const js = inlineJs(settings.customJs.trim());

  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {js && <script dangerouslySetInnerHTML={{ __html: js }} />}
    </>
  );
}
