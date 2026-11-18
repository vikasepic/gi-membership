/**
 * The admin pages a read-only person (users.is_viewer) may open.
 *
 * One list, read by the proxy, the sidebar and the tests. Closed by default:
 * a new admin page is shut to them until it is added here, and a page added
 * here must call requireViewer() itself (lib/admin-guard.ts). Nothing that
 * writes belongs on it: every action and write route keeps requireAdmin().
 *
 * No "server-only": the proxy and a client component both import this.
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */
export const VIEWER_PATHS: readonly string[] = ["/admin/journeys", "/admin/orders", "/admin/members", "/admin/traffic", "/admin/attribution"];

/** Where a read-only person is sent from any other admin address. */
export const VIEWER_HOME = "/admin/journeys";

/**
 * Whole path segments only, so /admin/membersX does not ride on
 * /admin/members. A ".." segment or any percent-encoding is refused outright:
 * no real page under these five has either, and neither is worth reasoning about.
 */
export function viewerMayOpen(pathname: string): boolean {
  if (pathname.includes("%") || pathname.split("/").includes("..")) return false;
  return VIEWER_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
