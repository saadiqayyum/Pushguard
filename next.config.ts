import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

// Dev only: Next refuses its own scripts to any origin but localhost, so a
// tunnel at AUTH_URL renders pages that never hydrate unless it is listed.
const devOrigin = process.env.AUTH_URL && URL.canParse(process.env.AUTH_URL)
  ? [new URL(process.env.AUTH_URL).hostname]
  : [];

// Tree-sitter grammars and tags queries are read from node_modules at runtime
// by the index and push jobs, so the file tracer cannot see them on its own.
const grammarFiles = ["./node_modules/web-tree-sitter/*.wasm", "./node_modules/tree-sitter-*/*.wasm", "./node_modules/tree-sitter-*/queries/tags.scm"];

// The landing and research index count the docs at render time.
const marketingDocs = ["./docs/attacks/**/*.md", "./docs/THREAT_CATALOG.md", "./docs/EXECUTION_SURFACES.md"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["recheck", "web-tree-sitter"],
  outputFileTracingIncludes: {
    "/api/jobs/run": grammarFiles,
    "/api/admin/contributor": ["./docs/attacks/**/*.md"],
    "/admin/inbox": ["./docs/attacks/**/*.md"],
    "/": marketingDocs,
    "/research": marketingDocs,
  },
  allowedDevOrigins: devOrigin,
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return ["/dashboard/:path*", "/admin/:path*", "/api/:path*"].map((source) => ({ source, headers: noindex }));
  },
  // Pages stay in the client cache between tab switches; Realtime events and
  // mutations call router.refresh(), which drops it when data actually changes.
  experimental: { staleTimes: { dynamic: 300 }, authInterrupts: true },
};

export default createMDX()(nextConfig);
