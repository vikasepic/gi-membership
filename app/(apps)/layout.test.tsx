import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The built-in apps' frame says whose account this is.
 *
 * Since 13 Oct 2026 an admin viewing as a member opens the member's own apps
 * and sessions. Anything typed there lands in the member's work, so the frame
 * carries the store's "Viewing as" strip, the same one the library shows.
 */
function arrange(who: { viewingAs: boolean; name: string | null; email: string | null } | null) {
  vi.resetModules();
  vi.doMock("@/lib/view-as", () => ({ viewer: async () => who && { id: "m1", actingAdminId: null, ...who } }));
  vi.doMock("@/app/(store)/view-as-actions", () => ({ stopViewAsAction: async () => {} }));
}

afterEach(() => {
  vi.doUnmock("@/lib/view-as");
  vi.doUnmock("@/app/(store)/view-as-actions");
});

async function render() {
  const { default: Layout } = await import("@/app/(apps)/layout");
  return renderToStaticMarkup(await Layout({ children: <p>app</p> }));
}

describe("the built-in apps' frame", () => {
  it("shows the Viewing as strip while an admin is in a member's account", async () => {
    arrange({ viewingAs: true, name: "Stellita Loukas", email: "s@example.com" });
    const html = await render();
    expect(html).toContain("Viewing as");
    expect(html).toContain("Stellita Loukas");
  });

  it("shows nothing extra to the member themselves", async () => {
    arrange({ viewingAs: false, name: null, email: "s@example.com" });
    expect(await render()).not.toContain("Viewing as");
  });
});
