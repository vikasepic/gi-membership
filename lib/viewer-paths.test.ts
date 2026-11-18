import { describe, it, expect } from "vitest";
import { VIEWER_PATHS, VIEWER_HOME, viewerMayOpen } from "@/lib/viewer-paths";

/**
 * The admin pages a read-only person may open. Closed by default: anything
 * not on the list is refused.
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */
describe("viewerMayOpen", () => {
  it.each(["/admin/journeys", "/admin/orders", "/admin/orders/export", "/admin/members/abc-123", "/admin/traffic/x", "/admin/attribution/visits"])(
    "opens %s",
    (p) => expect(viewerMayOpen(p)).toBe(true),
  );

  it.each([
    "/admin", "/admin/", "/admin/settings", "/admin/membersX", "/admin/members/../settings", "/Admin/Orders",
    "/admin/orders%2f..%2fsettings", "/admin/subscriptions", "/admin/offers", "/api/offers", "/library", "",
    "/admin/members/%2e%2e/settings", "/admin/members/.%2E/settings", "/admin/orders/..%2fsettings", "/admin/orders/a%5Cb",
    "/admin/traffic/%ZZ", "/admin/%6Frders", "/admin/members/%2E",
  ])("refuses %s", (p) => expect(viewerMayOpen(p)).toBe(false));

  it.each(["/admin/traffic/caf%C3%A9", "/admin/traffic/my%20funnel", "/admin/members/abc%2Ddef"])(
    "opens %s: a name that only needed encoding is still a name",
    (p) => expect(viewerMayOpen(p)).toBe(true),
  );

  it("opens a trailing slash on a real page", () => expect(viewerMayOpen("/admin/orders/")).toBe(true));

  it("lands a read-only person on a page they may open", () => {
    expect(VIEWER_PATHS).toContain(VIEWER_HOME);
    expect(VIEWER_PATHS).toEqual(["/admin/journeys", "/admin/orders", "/admin/members", "/admin/traffic", "/admin/attribution"]);
  });
});
