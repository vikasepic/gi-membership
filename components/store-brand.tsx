import { SETTINGS_DEFAULTS, type Settings } from "@/lib/settings-schema";

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
export function StoreBrand({ settings }: { settings: Settings }) {
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

  const css = [
    rules.length > 0 ? `:root{${rules.join(";")}}` : "",
    settings.customCss.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  const js = settings.customJs.trim();

  return (
    <>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {js && <script dangerouslySetInnerHTML={{ __html: js }} />}
    </>
  );
}
