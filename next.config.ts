import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// Routes fully ported to the FastAPI backend. Per-entry feature flag.
// EXACT paths (no sub-segments):
const EXACT_ROUTES = [
  "/api/calculate",
  "/api/companies",
  "/api/admin/check",
  "/api/admin/members",
  "/api/extract",
  // /api/merge, /api/employment, /api/extract-stream, /api/commentary are
  // handled by dedicated Next.js route handlers that manually proxy to
  // FastAPI. The default rewrite aborts long-lived requests in Next.js 16
  // (ECONNRESET / "socket hang up" after ~30s).
];

// WILDCARD prefixes (cover sub-paths like /api/history/:id, /api/history/:id/file/:type):
const WILDCARD_PREFIXES = [
  "/api/history",
  "/api/feedback",
];

const nextConfig: NextConfig = {
  async rewrites() {
    const exact = EXACT_ROUTES.map((source) => ({
      source,
      destination: `${BACKEND_URL}${source}`,
    }));
    const wild = WILDCARD_PREFIXES.flatMap((prefix) => [
      { source: prefix, destination: `${BACKEND_URL}${prefix}` },
      { source: `${prefix}/:path*`, destination: `${BACKEND_URL}${prefix}/:path*` },
    ]);
    return {
      // beforeFiles ensures our rewrites win over the legacy file-based
      // /api/** route handlers during the FastAPI migration. Remove once
      // the legacy handlers are deleted in Phase 7.
      beforeFiles: [...exact, ...wild],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
