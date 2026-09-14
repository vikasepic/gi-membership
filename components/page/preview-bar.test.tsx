import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/env", () => ({
  publicAnalyticsIds: () => ({ metaPixelId: "1", ga4MeasurementId: "G-TEST1", googleAdsId: "AW-TEST2" }),
}));
const { PreviewBar } = await import("@/components/page/preview-bar");

describe("the preview bar", () => {
  it("switches Google's tags off before they load", () => {
    // Seen on production on 14 Sep 2026: gtag sent a page_view for a preview
    // URL because the script mounts before the effect that unmounts it. GA's
    // own opt-out flag runs during parse, ahead of any afterInteractive script.
    const html = renderToStaticMarkup(<PreviewBar />);
    expect(html).toContain("Preview. Drafts shown. Not live.");
    expect(html).toContain(`window["ga-disable-G-TEST1"]=true`);
    expect(html).toContain(`window["ga-disable-AW-TEST2"]=true`);
  });
});
