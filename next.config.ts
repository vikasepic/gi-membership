import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // slim Docker image for Coolify/KVM
  /**
   * Which build this is, so a deploy does not break an open tab.
   *
   * Every build gives its chunks new hashed filenames and deletes the old
   * ones. A tab that was open across a deploy still holds the previous page,
   * so its next navigation asks for a chunk that no longer exists — and the
   * admin 404s until somebody thinks to hard-reload. That is a bad way to find
   * out a deploy happened, and it lands on the person who was mid-edit.
   *
   * Telling Next which deployment it is stamps the asset requests, so a
   * mismatch is recognised as version skew and answered with a clean reload
   * rather than a missing file. SOURCE_COMMIT is set by Coolify on every
   * build; the fallback keeps local development working, where the dev server
   * has no such problem.
   */
  deploymentId: process.env.SOURCE_COMMIT || undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Uploads go through server actions, and Next caps a server action body at
    // 1MB by default. That cap rejects the request BEFORE the action runs, so
    // nothing reached our validators and nothing was written — a cover image
    // simply vanished with no error, while a 497KB PDF went through fine.
    //
    // This has to be at least as large as what the uploaders advertise, or the
    // limit we show people is a lie: covers are capped at 5MB and attachments
    // at 100MB in lib/media.ts. Those validators still run and still reject —
    // this only stops Next from discarding the request first.
    serverActions: { bodySizeLimit: "100mb" },
  },
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    return [
      // Everything else stays un-frameable. Clickjacking a checkout is the
      // attack this header exists to stop.
      {
        source: "/:path*",
        headers: [
          ...base,
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      // The admin upsell preview renders the page in an iframe so a phone
      // preview gets its own viewport and media queries tell the truth. DENY
      // blocks that even same-origin, so this one admin-only route allows
      // framing by this site and nothing else.
      //
      // frame-ancestors rather than X-Frame-Options: SAMEORIGIN because CSP is
      // the header browsers actually honour for this, and it takes an explicit
      // origin list. Both are sent — the older header for anything that only
      // understands that, the CSP for everything current.
      //
      // Defined AFTER the catch-all on purpose: Next applies every matching
      // rule in order and the last one wins, so a specific rule placed first is
      // silently overwritten by the general one.
      {
        source: "/oto-preview/:id",
        headers: [
          ...base,
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      // Same reasoning for the course preview: a phone view is only truthful
      // when the frame has its own viewport. Admin-only, and framed by this
      // site alone.
      {
        source: "/course-preview/:path*",
        headers: [
          ...base,
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
