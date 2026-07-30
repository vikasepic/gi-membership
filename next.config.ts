import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // slim Docker image for Coolify/KVM
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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
