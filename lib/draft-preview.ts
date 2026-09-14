import "server-only";
import { getAdminUser } from "@/lib/admin-guard";
import { verifyPreviewToken } from "@/lib/preview-token";

/**
 * Whether this render should show drafts.
 *
 * `?preview=1` alone does nothing: a visitor who types it gets the live page.
 * It takes an admin session (a tab opened from the editor carries the cookie)
 * or a signed preview token (an iframe does not; see lib/preview-token.ts).
 */
export async function isDraftPreview(
  sp: { preview?: string; t?: string },
  tokenKind?: string,
): Promise<boolean> {
  if (sp.preview !== "1") return false;
  if (tokenKind && verifyPreviewToken(sp.t, tokenKind)) return true;
  return (await getAdminUser()) !== null;
}
