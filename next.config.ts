import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["saad.local-proxy.win"],

  // Dev only. Turbopack reuses chunk and stylesheet filenames across rebuilds,
  // so the CDN in front of this dev server hands the browser an old file for a
  // URL whose content has changed. Next already sends `no-cache`, but Cloudflare
  // rewrites it to `max-age=14400`, and the browser then skips revalidation for
  // four hours — which shows up as edits that simply do not appear.
  //
  // `no-store` is the one directive a Browser Cache TTL setting will not
  // override. Production is untouched: hashed assets there must stay immutable.
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/_next/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
