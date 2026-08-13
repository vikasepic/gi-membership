import "server-only";
import { getSettingsOrDefaults } from "@/lib/settings";
import { listFonts, fontFaceCss, familyStack } from "@/lib/fonts";
import { PREVIEW_SCOPE, type SitePreview } from "@/lib/site-typography";
import { paletteCss } from "@/lib/palette";

/**
 * The store's own type, for a preview inside the admin.
 *
 * The admin never renders StoreBrand — deliberately, so a store's CSS cannot
 * break the page you would go to to remove it. The cost was that the builder
 * resolved `--font-heading` to the font the app was built with and had no
 * `@font-face` for anything uploaded, so a page previewed in one typeface and
 * shipped in another.
 *
 * So the two variables are declared on the preview's own class rather than on
 * `:root`: the canvas gets the store's fonts and the admin around it keeps its
 * own. The faces themselves are unscoped because an `@font-face` cannot be
 * scoped — but declaring one only makes a file available, it restyles nothing.
 *
 * Never throws: a preview without the store's fonts is worth having, and a
 * settings row that cannot be read must not take the builder down with it.
 */
export async function storePreview(): Promise<SitePreview> {
  const [settings, fonts] = await Promise.all([getSettingsOrDefaults(), listFonts().catch(() => [])]);

  const vars: string[] = [];
  if (settings.headingFont) {
    vars.push(`--font-heading:${familyStack(settings.headingFont, "system-ui, sans-serif")}`);
  }
  if (settings.bodyFont) {
    vars.push(`--font-body:${familyStack(settings.bodyFont, "system-ui, sans-serif")}`);
  }

  return {
    fontCss: [
      fonts.length > 0 ? fontFaceCss(fonts, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") : "",
      vars.length > 0 ? `.${PREVIEW_SCOPE}{${vars.join(";")}}` : "",
      // Scoped for the same reason the fonts are: the canvas gets the store's
      // colours and the admin around it keeps its own.
      paletteCss(settings.palette, `.${PREVIEW_SCOPE}`),
    ]
      .filter(Boolean)
      .join("\n"),
    typography: settings.siteTypography,
    palette: settings.palette,
  };
}
