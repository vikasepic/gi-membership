import { publicAnalyticsIds } from "@/lib/env";

/**
 * Says what this is, on every preview, above everything.
 *
 * It also switches Google's tags off. The Analytics component unmounts itself
 * on a preview, but gtag.js is an afterInteractive script that has already
 * been asked for by then, and it sends page_view the moment it loads. GA's
 * own opt-out flag runs during parse, before any of that, and is the one
 * thing gtag checks every time it would send.
 */
export function PreviewBar() {
  const ids = publicAnalyticsIds();
  const off = [ids.ga4MeasurementId, ids.googleAdsId]
    .filter((id): id is string => !!id)
    .map((id) => `window[${JSON.stringify(`ga-disable-${id}`)}]=true;`)
    .join("");
  return (
    <>
      {off && <script dangerouslySetInnerHTML={{ __html: off }} />}
      <div className="sticky top-0 z-50 bg-navy px-3 py-1 text-center text-xs font-medium text-white">
        Preview. Drafts shown. Not live.
      </div>
    </>
  );
}
